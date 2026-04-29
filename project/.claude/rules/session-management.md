## Session Management (Recommended)

### Starting a New Session

At the beginning of each conversation:

1. Check `memory/session-resources.md` — if it has stale data from a previous session, archive a one-line summary and clear the rest
2. Run `git status` to understand the current working tree state
3. Note which branch you're on and what's uncommitted

### When to Use `/clear`

Use `/clear` to reset context when:

- You've completed a logical task and are starting a different one
- The conversation has accumulated stale context that's causing confusion
- You notice Claude referencing outdated information from earlier in the session
- You've hit a dead end and want a fresh approach to the same problem

Do NOT `/clear` when:

- You're mid-task with important unsaved context — save to `memory/session-resources.md` first
- You have an active plan or task list that would be lost

### When to Start a Fresh Session

Prefer a new session (new terminal tab / new `claude` invocation) over continuing when:

- The current session has had 3+ compactions (check `/tmp/claude-compaction.log`)
- You're switching to a completely unrelated task
- The session has been running for several hours with many file reads/writes

### Context Preservation Before Clear/Exit

Before `/clear` or ending a session, save any of these to `memory/session-resources.md`:

- Test URLs, file paths, screenshot paths
- Analysis results, debugging findings
- Review scores, audit findings
- Any data that took significant effort to produce
