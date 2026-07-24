import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import safeRm, {
	analyzeCommand,
	buildDeletionSnapshot,
	rewriteCommand,
	shellQuote,
	ENTRY_LIMIT,
	VALIDATE_RM_STATES,
	tooManyEntriesMessage,
} from "../extensions/safe-rm.ts";

async function fixtureDir(): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), "pi-safe-rm-"));
}

async function populate(root: string): Promise<void> {
	await fs.mkdir(path.join(root, "build", "nested"), { recursive: true });
	await fs.writeFile(path.join(root, "build", "a.txt"), "abc");
	await fs.writeFile(path.join(root, "build", "nested", "b.txt"), "hello");
	await fs.symlink(path.join(root, "elsewhere"), path.join(root, "build", "link"));
	await fs.mkdir(path.join(root, "build", ".hidden"));
	await fs.mkdir(path.join(root, "dist"));
}

test("documents every validate_rm result state in one exported list", () => {
	assert.deepEqual(VALIDATE_RM_STATES, [
		"validated",
		"unknown_request",
		"expired",
		"already_consumed",
		"cross_session",
		"dynamic_target",
		"protected_target",
		"unsupported_syntax",
		"too_many_entries",
		"filesystem_error",
		"cancelled",
		"no_matching_targets",
	]);
});

test("detects recursive-force rm variants and ignores non-guarded text", () => {
	const guarded = [
		"rm -rf build",
		"rm -fr build",
		"rm -r -f build",
		"rm -Rf build",
		"rm --recursive --force build",
		"/bin/rm -rf build",
		"command rm -rf build",
		"env FOO=bar rm -rf build",
		"sudo rm -rf build",
	];
	for (const command of guarded) {
		const analysis = analyzeCommand(command);
		assert.equal(analysis.status, "ok", command);
		assert.equal(analysis.invocations.length, 1, command);
	}

	for (const command of ["rm -r build", "rm -f build", "rm build", "echo 'rm -rf build'", "# rm -rf build"]) {
		const analysis = analyzeCommand(command);
		assert.equal(analysis.status, "ok", command);
		assert.equal(analysis.invocations.length, 0, command);
	}
});

test("finds multiple invocations and fails closed for dynamic indirection", () => {
	const compound = analyzeCommand("rm -rf build && echo ok; /bin/rm -fr dist");
	assert.equal(compound.status, "ok");
	assert.equal(compound.invocations.length, 2);

	assert.equal(analyzeCommand("git clean -fdx | xargs rm -rf").status, "dynamic_target");
	assert.equal(analyzeCommand("find . -name build -exec rm -rf {} ;").status, "dynamic_target");
	assert.equal(analyzeCommand("eval 'rm -rf build'").status, "dynamic_target");
	assert.equal(analyzeCommand("sh -c 'rm -rf build'").status, "unsupported_syntax");
});

test("enumerates deletion sets with lstat semantics and standard globs", async () => {
	const root = await fixtureDir();
	await populate(root);
	const analysis = analyzeCommand("rm -rf build/* missing*");
	const snapshot = await buildDeletionSnapshot(root, analysis.invocations);

	assert.deepEqual(snapshot.roots.map((value) => path.relative(root, value)).sort(), ["build/a.txt", "build/link", "build/nested"]);
	assert.equal(snapshot.unmatchedPatterns.length, 1);
	assert.equal(snapshot.counts.files, 2);
	assert.equal(snapshot.counts.directories, 1);
	assert.equal(snapshot.counts.symlinks, 1);
	assert.equal(snapshot.apparentBytes, 8);
	assert.equal(snapshot.sample.some((value) => value.endsWith("build/nested/b.txt")), true);
	assert.equal(snapshot.sample.some((value) => value.endsWith("build/.hidden")), false);
});

test("denies protected roots and rejects dynamic operands", async () => {
	const root = await fixtureDir();
	await populate(root);
	await assert.rejects(
		() => buildDeletionSnapshot(root, analyzeCommand("rm -rf .").invocations),
		/protected/i,
	);
	await assert.rejects(
		() => buildDeletionSnapshot(root, analyzeCommand("rm -rf ..").invocations),
		/protected/i,
	);
	await assert.rejects(
		() => buildDeletionSnapshot(root, analyzeCommand("rm -rf $TARGET").invocations),
		/Dynamic rm target rejected/,
	);
	await assert.rejects(
		() => buildDeletionSnapshot(root, analyzeCommand("rm -rf {a,b}").invocations),
		/Unsupported rm target syntax/,
	);
});

test("fingerprint changes when selected paths or file types change", async () => {
	const root = await fixtureDir();
	await populate(root);
	const analysis = analyzeCommand("rm -rf build dist");
	const before = await buildDeletionSnapshot(root, analysis.invocations);
	await fs.rm(path.join(root, "dist"), { recursive: true, force: true });
	await fs.writeFile(path.join(root, "dist"), "now-a-file");
	const after = await buildDeletionSnapshot(root, analysis.invocations);
	assert.notEqual(before.fingerprint, after.fingerprint);
});

test("rewrites approved commands to concrete quoted roots", async () => {
	const root = await fixtureDir();
	await fs.mkdir(path.join(root, "leading"), { recursive: true });
	await fs.writeFile(path.join(root, "leading", "-dash"), "x");
	await fs.writeFile(path.join(root, "leading", "space name"), "y");
	const command = "echo before && rm -rf leading/* missing && echo after";
	const analysis = analyzeCommand(command);
	const snapshot = await buildDeletionSnapshot(root, analysis.invocations);
	const rewritten = rewriteCommand(command, analysis, snapshot);
	assert.equal(
		rewritten,
		`echo before && rm -rf -- ${shellQuote(path.join(root, "leading", "-dash"))} ${shellQuote(path.join(root, "leading", "space name"))} && echo after`,
	);
});

test("entry cap uses 10,000 and reports an actionable hard-cap message", () => {
	assert.equal(ENTRY_LIMIT, 10_000);
	const message = tooManyEntriesMessage(10_001);
	assert.match(message, /Hard cap is 10,000 entries/);
	assert.match(message, /at least 10,001 discovered entries/);
	assert.match(message, /cannot authorize this single rm -rf/);
	assert.match(message, /delete smaller subtrees in batches/);
	assert.match(message, /ask_user_question first/);
});

test("Pi hook blocks, validate_rm approves, and one retry is rewritten", async () => {
	const root = await fixtureDir();
	await fs.mkdir(path.join(root, "target"));
	await fs.writeFile(path.join(root, "target", "file.txt"), "x");
	const tools = new Map<string, any>();
	const handlers = new Map<string, any>();
	safeRm({
		registerTool(definition: any) {
			tools.set(definition.name, definition);
		},
		on(name: string, handler: any) {
			handlers.set(name, handler);
		},
	} as any);

	const ctx = { cwd: root, sessionManager: { getSessionId: () => "session-1" } } as any;
	const event = { toolName: "bash", input: { command: "rm -rf target" } } as any;
	const first = await handlers.get("tool_call")(event, ctx);
	assert.equal(first.block, true);
	assert.match(first.reason, /Blocked: no files were deleted/);
	const requestId = first.reason.match(/"requestId":"([^"]+)"/)?.[1];
	assert.ok(requestId);

	const validation = await tools.get("validate_rm").execute("tool-call", { requestId }, undefined, undefined, ctx);
	assert.equal(validation.details.state, "validated");
	assert.match(validation.content[0].text, /target/);

	const retry = { toolName: "bash", input: { command: "rm -rf target" } } as any;
	const allowed = await handlers.get("tool_call")(retry, ctx);
	assert.equal(allowed, undefined);
	assert.equal(retry.input.command, `rm -rf -- ${shellQuote(path.join(root, "target"))}`);

	const secondRetry = { toolName: "bash", input: { command: "rm -rf target" } } as any;
	const blockedAgain = await handlers.get("tool_call")(secondRetry, ctx);
	assert.equal(blockedAgain.block, true);
});
