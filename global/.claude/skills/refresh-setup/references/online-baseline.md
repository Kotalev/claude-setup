# Online baseline (Phase 3)

Cross-reference the project against current Claude Code documentation. This phase is a fallback layer — the static checks in Phase 2 already catch most issues. The online baseline catches the things that change underneath you: new settings keys, deprecated event names, new skill / agent frontmatter conventions.

Use `WebFetch` (not `firecrawl`, not `agent-browser`) — these are stable doc pages, a single GET is enough. If a fetch fails (network blocked, 4xx, empty body), record the failure for the report and move on. Do not retry more than once per URL.

## URLs to fetch

Fetch these in parallel. Each is paired with the per-URL extract-and-compare instruction.

### A. Settings reference

- **URL**: `https://docs.claude.com/en/docs/claude-code/settings`
- **Purpose**: canonical list of `settings.json` keys, their types, allowed values.
- **Extract**: every JSON key documented at the top level of settings.json.
- **Compare**:
  1. Keys in the live docs but NOT in the project's `.claude/settings.json` and `.claude/settings.local.json` → potential coverage gaps. Suggest only keys with clear utility (e.g. `model`, `cleanupPeriodDays`, `defaultMode`, `apiKeyHelper` if relevant).
  2. Keys in the project's settings.json that are NOT in the live docs → potential deprecation. Cross-check by also searching the docs for the key — sometimes they live on a sub-page.

### B. Hooks reference

- **URL**: `https://docs.claude.com/en/docs/claude-code/hooks`
- **Purpose**: canonical list of hook event names and their schemas.
- **Extract**: every event name (e.g. `PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`, `Notification`, `UserPromptSubmit`, `PreCompact`).
- **Compare**:
  1. Hook events configured in the project's `settings.json` (under `hooks.<EventName>`) — verify each name appears in the live docs.
  2. Hook scripts in `.claude/hooks/` that reference event names via shebang or comments — verify each.
  3. Useful events the project doesn't use yet — surface as low-severity coverage gaps (don't push hard).

### C. Sub-agents reference

- **URL**: `https://docs.claude.com/en/docs/claude-code/sub-agents`
- **Purpose**: canonical schema for `.claude/agents/*.md` frontmatter.
- **Extract**: required + optional frontmatter keys; how `tools:`, `model:`, etc. are spelled.
- **Compare**:
  1. Project agent files — every required key must be present.
  2. Project agent files — flag any frontmatter key that the docs no longer mention as deprecation candidates.

### D. Slash commands / skills reference

- **URL**: `https://docs.claude.com/en/docs/claude-code/slash-commands`
- **Purpose**: how user-invocable commands and skills are defined.
- **Extract**: file format / frontmatter fields, the relationship between skill name and `/<name>` invocation.
- **Compare**:
  1. Project commands in `.claude/commands/` — verify they conform to current schema.
  2. Project skills in `.claude/skills/` (if any) — same.

### E. Memory & CLAUDE.md reference

- **URL**: `https://docs.claude.com/en/docs/claude-code/memory`
- **Purpose**: how CLAUDE.md / CLAUDE.local.md / `@imports` work today.
- **Extract**: import syntax (`@path/to/file.md`), file precedence order, length recommendations.
- **Compare**:
  1. Every `@-reference` in CLAUDE.md → verify the syntax matches current docs.
  2. CLAUDE.md files exceeding the recommended length cap → flag as low-severity bloat.

### F. Permissions reference

- **URL**: `https://docs.claude.com/en/docs/claude-code/iam`
- **Purpose**: canonical `permissions.allow` / `permissions.deny` syntax, glob rules.
- **Extract**: pattern syntax, escaping rules, structured permission objects (if any).
- **Compare**:
  1. Project permission strings — flag any that look malformed against current syntax.
  2. Suggest a minimal `permissions.deny` baseline if empty (see static-check 4.3).

## Robustness rules

- **One GET per URL.** If a page redirects, follow the first redirect only.
- **Cache in memory.** Don't re-fetch the same URL within a single audit run.
- **Treat docs as advisory, not authoritative.** If the live docs and a long-standing project pattern conflict, flag with **low** severity and explain the discrepancy — the user decides.
- **Network failure is not a fatal error.** If you can't reach `docs.claude.com`, skip Phase 3 entirely and note it in the report header: "online baseline skipped — network unavailable".
- **Don't recommend brand-new features blindly.** A new key in the docs doesn't mean every project should adopt it. Only suggest adoption when there's a concrete use case visible in the project (e.g. recommend a TypeScript-aware PostToolUse hook only if the project already has a TS build).

## Output

The findings produced here merge into the same Phase-2 finding list. Use the `category: deprecated` or `category: gap` tags. Cite the URL in the `suggested_fix` so the user can verify.
