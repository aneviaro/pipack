# @aneviaro/pi-safe-rm

Pi extension that intercepts model-issued `bash` calls containing recursive-force `rm` commands (`rm -rf`, `rm -fr`, `rm --recursive --force`, etc.). The first call is blocked with no deletion. The model must call `validate_rm` using the provided request ID, inspect the deletion summary, then retry the exact same command once to approve execution.

## Behavior

- Blocks only model-issued `bash` tool calls; direct user `!`/`!!` shell commands are out of scope.
- Requires both recursive and force behavior before guarding a command.
- Binds approval to the exact command bytes, working directory, session, deletion snapshot, and a five-minute TTL.
- Revalidates immediately before the retry and consumes the approval before the shell runs.
- Rewrites approved invocations to concrete, safely quoted existing roots after `--`; missing literals and unmatched globs are omitted.
- Permanently denies `/`, your home directory, the working directory, and any ancestor of the working directory.
- Supports literal path operands and standard `*`, `?`, and bracket-expression globs.
- Rejects dynamic targets such as variables, command substitution, process substitution, `eval`, `xargs rm -rf`, `find -exec rm -rf`, brace expansion, extglob, and unsupported nested shell rewrites.
- Traverses with `lstat`, does not follow symlinks, reads no file contents, and fails closed above 10,000 discovered entries.

## Install

```bash
pi install npm:@aneviaro/pi-safe-rm
```

For local development from this repo:

```bash
pi -e ./packages/safe-rm
```

## Important limitations

This reduces accidental deletion risk; it is not a security boundary against a malicious model with unrestricted shell access. Other deletion mechanisms (`find -delete`, language APIs, trash tools, external scripts) are intentionally not covered. A small residual race remains between final revalidation and process execution.

## Development

```bash
cd packages/safe-rm
npm test
npm run typecheck
npm run pack:check
```
