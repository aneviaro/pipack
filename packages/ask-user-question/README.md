# pi-ask-user-question

A Pi package that adds `ask_user_question`, a blocking clarification tool with multiple-choice and freeform answers.

## Demo

![ask_user_question presents a recommended multiple-choice prompt in Pi](assets/ask-user-question-demo.png)

## Install

```bash
pi install npm:@aneviaro/pi-ask-user-question
```

For local development:

```bash
pi install /absolute/path/to/ask-user-question
```

## Tool behavior

- Asks one concise blocking question.
- Supports labeled options with stable values.
- Allows a custom freeform answer by default.
- Returns the selected label and stable value, or the custom response.
- Refuses to prompt in non-interactive modes.
