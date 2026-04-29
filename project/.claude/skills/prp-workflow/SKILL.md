---
name: prp-workflow
description: Create, execute, and manage Product Requirement Prompts (PRPs) — structured feature plans that fuse PRD scope with context-engineering so an AI agent can ship in one pass. MUST be used — without asking — whenever (1) the user asks to create/write/generate a PRP, (2) the user asks to execute/implement/run a PRP, (3) the user references a file under PRPs/generated/ or PRPs/tasks/, (4) the user asks to list/index/update the PRP registry, or (5) the assistant itself is about to propose writing a PRP or a plan file under PRPs/. Trigger phrases (English and Bulgarian) include "write/create/generate a PRP", "let's make a PRP", "execute/implement/run the PRP at <path>", "напиши/създай PRP", "направи PRP", "изпълни PRP", "нека (си) напишем PRP", "ще напиша PRP за ...". Route to references/writing.md for creation, references/executing.md for implementation, references/indexing.md for registry updates.
user-invocable: true
disable-model-invocation: false
---

# PRP Workflow

Portable skill for the three PRP lifecycle workflows: **writing** new PRPs, **executing** existing PRPs, and **indexing** the PRP registry.

## What is a PRP?

A Product Requirement Prompt is a structured document that fuses a PRD (goal + why) with context-engineering (file paths, code snippets, gotchas, validation gates) so an AI agent can ship a vertical slice in one pass. See `PRPs/README.md` for the full concept.

Standard artifact layout (adapt folder names to the host project if they differ):

| Location | Purpose |
|----------|---------|
| `PRPs/generated/` | Finished PRPs ready for execution |
| `PRPs/tasks/` | Research/analysis notes that feed future PRPs |
| `PRPs/templates/` | Canonical templates (`prp_base.md`, `prp_task.md`, `prp_start_initial.md`) |
| `PRPs/INDEX.md` | Registry of all PRPs with status (maintained by the indexing workflow) |

## Workflow Selector

Pick exactly one workflow per invocation. If the request is ambiguous, ask the user before continuing.

| User asks... | Workflow | Reference file |
|--------------|----------|----------------|
| "Generate a PRP for X", "write a PRP from this brief" | **writing** | [references/writing.md](references/writing.md) |
| "Execute this PRP", "implement the PRP at path/foo.md" | **executing** | [references/executing.md](references/executing.md) |
| "Update the PRP index", "which PRPs are still open", "classify generated/" | **indexing** | [references/indexing.md](references/indexing.md) |

Read only the reference for the chosen workflow — the others waste context.

## Shared Conventions

These apply to all three workflows:

- **Project conventions take precedence.** Before writing or executing a PRP, read the project's `CLAUDE.md` (root) and any rule files under `.claude/rules/` (if present). They define the host project's security posture, naming rules, forbidden operations, testing style, and preferred agents. The PRP must honor those rules.
- **Dynamic specialist selection.** If the host project defines specialist agents (in `.claude/rules/agent-delegation.md`, agent configs, or similar), map touched paths to the matching specialists. Do not blanket-assign a fixed set of agents — pick based on the actual work.
- **Template source of truth.** Use `PRPs/templates/prp_base.md` for feature PRPs and `PRPs/templates/prp_task.md` for task-scoped changes. An enhanced base template also ships with this skill at [assets/prp_base_template.md](assets/prp_base_template.md); keep both in sync when customizing.
- **Output location.** New PRPs land in `PRPs/generated/{kebab-case-name}.md`. Research-only notes go to `PRPs/tasks/`.
- **Validation gates are non-negotiable.** Every PRP must include executable validation commands — at minimum syntax/type checks, unit tests, and a manual/integration step. Exact commands come from the host project's tooling.
- **Language.** PRP files are in English by default. Conversational responses follow the host project's language preference.
- **Git safety.** Respect any project-level restrictions on destructive git commands. When in doubt, do not push, reset, stash, or force.

## Quick Decision Tree

```
user message
│
├── mentions specific PRP file or "execute/run PRP"  → executing.md
├── provides a feature brief or "create/write PRP"   → writing.md
├── asks about status / listing / active PRPs       → indexing.md
└── ambiguous                                       → ask one focused question
```

## Adopting in a New Project

To drop this skill into another project:

1. Copy `.claude/skills/prp-workflow/` into the target repo (preserving `SKILL.md`, `references/`, `assets/`).
2. Create the `PRPs/` folder at the project root with subfolders `generated/` and `tasks/`, plus `PRPs/templates/prp_base.md` (copy `assets/prp_base_template.md` into it). Optionally add `PRPs/README.md` explaining the concept to the team.
3. (Optional) Define `.claude/rules/agent-delegation.md` so the skill can pick specialists based on touched paths; otherwise executions fall back to generic agents.
4. Make sure the target project's `CLAUDE.md` captures security/testing/git/naming conventions — the skill reads these when writing and executing PRPs.
5. The skill auto-activates on natural-language triggers; no slash commands required.
