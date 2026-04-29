## Ask Before Assuming (Mandatory)

When you are **unsure** about the user's intent, requirements, or a technical decision, **never assume** — always ask.

### Rules

1. **One question at a time** — do not batch multiple unrelated questions into a single prompt. Ask the most important question first, get an answer, then proceed or ask the next question if needed.
2. **Ask before acting** — if you're about to make a choice that could go either way (e.g., naming, architecture, scope, behavior on edge cases), ask first rather than picking one and hoping it's right.
3. **Proceed only after getting an answer** — do not continue with an assumed default while "waiting" for a response. Stop and wait.
4. **Don't ask what you can look up** — if the answer is in the code, git history, CLAUDE.md, or project files, read it yourself. Only ask about things that require the user's judgment or context you cannot derive.

### When to Ask

- The user's request is ambiguous or underspecified
- Multiple valid approaches exist and the tradeoffs are non-obvious
- You're about to make a decision that would be hard to reverse
- You're unsure whether a change should be scoped narrowly or broadly
- Requirements are unclear (e.g., "make it better" — better how?)

### When NOT to Ask

- The answer is clearly stated in the user's message
- The codebase or documentation already answers the question
- The decision is trivial and easily reversible (e.g., variable naming in a local scope)
- You've already asked about the same topic in this conversation

### Anti-Patterns

```
// WRONG: Guessing and hoping
"I'll assume you want X and proceed..."
"I'm going to go with X since you didn't specify..."

// WRONG: Batching unrelated questions
"I have three questions: 1) Should I use X or Y? 2) What about the naming? 3) Do you want tests?"

// WRONG: Asking about things you can look up
"What database does this project use?" (it's in CLAUDE.md)

// RIGHT: Focused, single question via AskUserQuestion
"Should the validation reject silently or return an error message to the user?"
```
