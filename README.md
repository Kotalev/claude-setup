# claude_setup

A portable, version-controlled Claude Code setup. This repo stores my entire Claude Code configuration — both the **global** part (applies to every project) and the **per-project** part (ships with a specific project) — so I can drop it into a new project or onto a new machine quickly, and track changes through git.

## Structure

The repo is split into two tiers that mirror where Claude Code reads its configuration from:

```
.
├── global/                 → your global ~/.claude (applies to ALL projects)
│   ├── CLAUDE.md           → ~/.claude/CLAUDE.md  (global instructions/preferences)
│   └── .claude/skills/     → ~/.claude/skills/    (global skills)
│
└── project/                → .claude inside a SPECIFIC project (travels with the project)
    ├── .claude/
    │   ├── settings.json   → env, hooks, permissions
    │   ├── agents/         → subagent definitions (elite-code-reviewer, strategy-analyzer)
    │   ├── commands/       → slash commands (/auto-tasks)
    │   ├── hooks/          → SessionStart + PostToolUse security scan
    │   ├── rules/          → rules injected into context
    │   └── skills/         → project-scoped skills
    ├── PRPs/               → Product Requirement Prompts (templates + generated)
    ├── scripts/auto-tasks/ → Node CLI behind /auto-tasks (no external dependencies)
    └── tasks/              → autonomous task queue (inbox/processing/archive)
```

## `global/` — global configuration

Applies to every project on the machine.

- **`CLAUDE.md`** — personal global preferences (communication language, subagent model, ban on destructive git commands) + "Rules of coding" (think before coding, simplicity first, surgical changes, goal-driven execution).
- **`.claude/skills/`** — global skills:
  - `grill-me`, `grill-with-docs` — stress-test a plan/design by interrogating it until shared understanding is reached.
  - `improve-codebase-architecture` — finds refactoring/deepening opportunities, guided by CONTEXT.md and the ADRs.
  - `refresh-setup` — audits a project's Claude configuration (CLAUDE.md + `.claude/`).
  - `refresh-docs` — generates/refreshes a `documentation/` folder from the code.
  - `refresh-tests` — audits the unit/integration tests (multi-language).
  - `to-prd`, `to-issues` — turn context/a plan into a PRD and into issues in the tracker.
  - `caveman` — style skill.

## `project/` — per-project configuration

This is the "starter pack" you copy into `.claude/` of a new project.

- **`.claude/settings.json`** — env flags (tool search, subagent model = opus, autocompact override), hooks, and permissions (deny on dangerous `rm` / force push).
- **`.claude/hooks/`**
  - `session-start-reminder.sh` — injects a reminder at the start of a session.
  - `security-scan.py` — runs after `Edit|Write|MultiEdit`.
- **`.claude/rules/`** — `ask-before-assuming`, `code-review`, `session-management`.
- **`.claude/agents/`** — `elite-code-reviewer`, `strategy-analyzer`.
- **`.claude/commands/`** — `/auto-tasks`.
- **`.claude/skills/`** — `commit-message`, `multilevel-thinking`, `prp-workflow`, `review-changes`, `security`.
- **`PRPs/`** — templates for Product Requirement Prompts + `generated/` for the concrete ones.
- **`scripts/auto-tasks/`** — Node CLI behind `/auto-tasks` (autonomous task queue; see `project/AUTO-TASKS.md`).
- **`tasks/`** — `inbox/`, `processing/`, `archive/`. The task files themselves are **local** (gitignored); only the folders are kept via `.gitkeep`.

## How to use

### The global part (once per machine)

Copy (or symlink) into `~/.claude`:

```bash
cp global/CLAUDE.md ~/.claude/CLAUDE.md
cp -R global/.claude/skills/. ~/.claude/skills/
```

### The per-project part (for each new project)

From the root of the target project:

```bash
cp -R /path/to/claude_setup/project/.claude ./.claude
cp -R /path/to/claude_setup/project/PRPs ./PRPs        # optional
cp -R /path/to/claude_setup/project/scripts ./scripts  # if you'll use /auto-tasks
cp -R /path/to/claude_setup/project/tasks ./tasks       # if you'll use /auto-tasks
```

> Symlinking instead of `cp` keeps projects in sync with the repo, but then `.claude/` points outside the project — choose based on whether you want the configuration to travel with the project itself.

## Notes

- `memory/` and Claude's runtime files are gitignored.
- Task files in `tasks/inbox|processing|archive` are local; `tasks/auto-tasks.config.json` is intentionally version-controlled (shared project setup).
- For the autonomous task queue, see `project/AUTO-TASKS.md`.
