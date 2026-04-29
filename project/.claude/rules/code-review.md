---
description: Mandatory code review after every implementation
paths: ["**/*.{js,jsx,ts,tsx}"]
---

## Mandatory Code Review

After completing ANY implementation task (new feature, bug fix, refactor), ALWAYS run `elite-code-reviewer` on the changed files. This is NOT optional.

1. Complete implementation
2. Run `elite-code-reviewer` on all changed files
3. Score >= 7/10 -> accepted, proceed
4. Score < 7/10 -> fix ALL "Required Changes", re-run reviewer
5. Repeat until score >= 7/10
6. Never consider a task "done" with a score below 7
