# Auto Task Runner

Manage the autonomous task queue at `tasks/` backed by the Node CLI at `scripts/auto-tasks/index.js`. State lives in per-task markdown files with YAML frontmatter. All destructive actions go through the CLI — never hand-edit task files from this command.

## Arguments

`$ARGUMENTS` — first token is the subcommand; the rest is subcommand-specific.

Subcommands:
- `new` — create one task interactively
- `new "<description>"` — create one task from a short description
- `new --from <path>` — ingest many tasks from a document
- `plane` — import your Plane "Todo" work items: verify each live with Chrome DevTools MCP, then create an auto-task with a verification section
- `approve <id...>` — flip one or more tasks from `new` to `for_dev`
- `list` — print a status summary
- `status <id>` — show details of one task
- `run` — claim all `for_dev` tasks and dispatch work (used by cron and manual)
- `verify` — claim one `awaiting_verification` task, start `apps/api` (:4101) and `apps/web` (:4100) from its worktree, verify against Chrome DevTools MCP, decide `verified` (→ archive) or `not_verified` (used by cron and manual)
- `retry <id>` — flip a `failed` task back to `for_dev`
- `cleanup` — remove tasks (from `archive/` or `processing/`) that are manually marked `status: commited` or `status: committed`, and remove their git worktrees
- `install-cron` — register the hourly cron once
- `uninstall-cron` — unregister the cron

## Process

### Subcommand: `new` (no arguments)

1. Ask the user for a title via `AskUserQuestion` (short input).
2. Ask the user for a `test_url` via `AskUserQuestion` (short input). Prompt: *"Relative URL to open after dev is done (e.g. `/editor/<token>` or `/pdf/<token>`). Leave blank to skip verification — the task will land in `not_verified` and the verify cron won't pick it up."* Accept empty input as "skip".
3. Bash: `node scripts/auto-tasks/index.js next-id --date $(date -u +%Y-%m-%d)`. Parse the id from the JSON output.
4. Bash: build the payload and create the task. Include `test_url` only when the user provided one (otherwise omit it so the CLI records `null`):
   ```bash
   # payload.json — set test_url to the user's input OR omit the field
   cat > /tmp/at-new.json <<'EOF'
   {"title": "<user title>", "test_url": "<user test_url or omit>", "body": "## Context\n\n(describe the problem)\n\n## Acceptance Criteria\n\n- [ ] ...\n\n## References\n\n- Files: \n"}
   EOF
   node scripts/auto-tasks/index.js create --json /tmp/at-new.json
   rm /tmp/at-new.json
   ```
5. Print the resulting path and tell the user to edit Context / Acceptance Criteria / References, then run `/auto-tasks approve <id>`.

### Subcommand: `new "<description>"`

1. Read the description from `$ARGUMENTS` (everything after the `new` keyword).
2. Grep the repo for the most likely affected files (use the `Grep` tool with keywords pulled from the description — nouns and module-ish names).
3. Write a candidate payload to a tmp JSON file:
   ```json
   {"title": "<summarised title>", "files": ["path/a", "path/b"]}
   ```
4. Bash: `node scripts/auto-tasks/index.js find-related --json /tmp/at-related.json`. Parse `matches`.
5. If `matches` is non-empty, present an `AskUserQuestion` with options `[append <first_match_id> / new / cancel]`.
   - `append <id>` → Bash: `node scripts/auto-tasks/index.js append-criterion --id <id> --text "<short derived criterion>"`. Print confirmation.
   - `new` or no matches → ask the user for a `test_url` via `AskUserQuestion` (same prompt as the interactive `new` flow — blank = skip verification). Then build the final payload (title, optional `test_url`, body with filled Context/AC/References) and Bash: `node scripts/auto-tasks/index.js create --json /tmp/at-new.json`.
   - `cancel` → abort, write nothing.
6. Clean up tmp files.

### Subcommand: `new --from <path>`

1. Validate `<path>` exists; Read the file.
2. Extract candidate tasks. Look for bulleted lists, numbered items, "Issue #", "Task:" sections, and prose paragraphs that describe discrete problems. For each candidate:
   - `title` — short, imperative summary
   - `body` — full context copied from the source
   - `files` — best-effort list of affected files (grep the repo for names from the candidate)
   - `topic` — short kebab-case identifier for the **functional area / problem type** the task belongs to (examples: `pdf-sidebar`, `docx-table-borders`, `spreadsheet-frozen-panes`, `auth-session`). Candidates that address the **same feature or same kind of problem** MUST share the exact same `topic` string so they get grouped even when their `files` don't overlap. Reuse an earlier topic when it fits; otherwise invent a concise new one. Leave empty only if the task is genuinely one-off and shouldn't bucket with anything else.
3. Write the candidates array to `/tmp/at-candidates.json`.
4. Bash: `node scripts/auto-tasks/index.js group-candidates --json /tmp/at-candidates.json`. Parse `{groups, standalone}`. The CLI unions candidates whenever they share **any** of: a file path, a module root, or a normalized topic — so "same functionality" (topic match) and "same files touched" (file/module match) both force a merge, and the match is transitive.
5. For each group with `title: null`, generate a human title (one short phrase covering all items, ideally echoing the group's `topic` and/or `module`). For each `item` in a group, summarise it into a single acceptance criterion bullet.
6. Present the preview to the user (text, not browser):
   ```
   Detected <N> candidate tasks in <path>.
   Proposed groupings:
     Group A (<k> items → 1 task): "<title>"   [topic: <topic>, module: <module>]
       • <item 1 summary>
       • <item 2 summary>
       Common files: ...
     Standalone (<m> tasks): [list titles]
   Create <X> tasks from these <N> items? [yes / edit / separate all / cancel]
   ```
   Use `AskUserQuestion`. On `edit`, enter a loop where the user can regroup items until satisfied; or on `separate all`, skip grouping entirely; on `cancel`, abort.
7. After the grouping is accepted, ask the user for a single default `test_url` via `AskUserQuestion`. Prompt: *"Default `test_url` to apply to ALL tasks created from this document (e.g. `/editor/<token>`). Leave blank to skip verification for all of them."* This is a batch prompt — do NOT ask per-task. If the user provides a value, include it in every payload; if blank, omit `test_url` (CLI stores `null` → verify cron skips).
8. For each accepted group and standalone, build a payload and Bash: `node scripts/auto-tasks/index.js create --json /tmp/at-one.json`. Always include `source: "<path>"` in the payload; groups also include `merged_from: [...]`; the optional `test_url` from step 7 goes in every payload when provided.
9. Print the list of created ids and a reminder that they are `status: new` and need `/auto-tasks approve`. If `test_url` was set, mention it so the user knows the batch is verification-eligible.

### Subcommand: `approve <id...>`

For each id in `$ARGUMENTS`:
- Bash: `node scripts/auto-tasks/index.js approve --id <id>`. On error, print and continue with remaining ids.

### Subcommand: `list`

- Bash: `node scripts/auto-tasks/index.js list`. Parse and print a counts-by-status table.

### Subcommand: `status <id>`

- Bash: `node scripts/auto-tasks/index.js list` and filter the printed list for that id. Show all fields. If `worktree` is set, echo the absolute path (prefix with repo root).

### Subcommand: `run`

This is the main autonomous loop. It must be fully non-interactive (cron runs with no user).

1. Record start time.
2. Bash: `node scripts/auto-tasks/index.js list --status for_dev`. Parse `tasks[]`.
3. If empty: write a log entry and exit.
   ```bash
   echo '{"trigger":"run","picked":0,"done":0,"failed":0,"duration_ms":0}' > /tmp/at-log.json
   node scripts/auto-tasks/index.js log-run --json /tmp/at-log.json
   ```
   Output: `No tasks in for_dev. Nothing to do.`.
4. For each task, derive a slug from its filename (the CLI `list` output includes `id`; to get the full filename or slug, you can `ls tasks/inbox/` and match the id prefix). Claim sequentially — atomic rename guarantees no double-claim even if cron + manual overlap:
   ```bash
   node scripts/auto-tasks/index.js claim --id <id> --worktree ".claude/worktrees/<slug>" --branch "feature/<slug>"
   ```
   Parse `{claimed, task}`. Collect successful claims into `claimedTasks`.
5. For each claimed task, create its worktree. Reuse the existing `/worktree` logic inline (do NOT call the slash command recursively):
   ```bash
   git worktree add -b feature/<slug> .claude/worktrees/<slug> HEAD
   cd .claude/worktrees/<slug>
   pnpm install
   cd -
   ```
   The worktree starts from the main repo's current HEAD (whatever branch is checked out at claim time). Uncommitted changes in the main repo are not copied — if needed in the worktree, commit them in main first.

   If any worktree creation fails, call `fail --error "worktree creation: <msg>"` for that task and drop it from `claimedTasks`.
6. Dispatch subagents in a **single message with multiple `Agent` tool uses** (concurrent). For each claimed task, build one `Agent` call:
   - `model: "opus"` (per global rule)
   - `subagent_type`: value of `frontmatter.agent` if present, else `general-purpose`
   - `description`: the task title
   - `prompt`: embed the full task markdown (frontmatter + body), the absolute worktree path, and these instructions:
     > You are working in an isolated git worktree. Do all file edits inside `<absolute worktree path>`. Follow the project's TDD rule (`superpowers:test-driven-development`), the portability rule (no `node:fs`, `process.env` in Hono handlers — see `.claude/rules/portability-check.md`), and the composite-PK rule for any new DB tables (see `.claude/rules/composite-pk.md`). When done: (1) run `pnpm test` and ensure all affected tests pass, (2) write `<worktree>/TASK-REPORT.md` with sections "Summary", "Changed files", "How to verify", (3) `git add` and `git commit` inside the worktree (committing IS permitted inside the isolated worktree — the "no-commit" rule applies to the main repo, not to worktree branches). Return a JSON summary `{"success": true|false, "changed_files": [...], "error": "..."}`.
7. When subagents return, per task:
   - If `success: false` → Bash: `node scripts/auto-tasks/index.js fail --id <id> --error "<error>"`. Do NOT remove the worktree. Continue.
   - If `success: true` → proceed to review loop.
8. **Review loop (max 3 cycles per task):**
   - Spawn `Agent` with `subagent_type: elite-code-reviewer`, `model: "opus"`. Prompt: review `<changed_files>` in `<worktree>` against the task's acceptance criteria. Return `{"score": <int 1-10>, "required_changes": [...], "notes": "..."}`.
   - If `score >= 7`: exit loop with the score.
   - Else: spawn another `Agent` (same subagent_type as the implementation agent) with the `required_changes` as instructions, cd'd into the worktree. When it returns, re-review.
   - After 3 failed cycles, Bash: `node scripts/auto-tasks/index.js fail --id <id> --error "review score stuck at <score> after 3 attempts"`. Continue.
9. On success: Bash: `node scripts/auto-tasks/index.js complete-dev --id <id> --review-score <score>`.
   The task stays in `processing/` with status `awaiting_verification` (if `test_url` is populated) or `not_verified` (if `test_url` is null). Archiving now happens only via the verify cron.
10. After all tasks finish, write the run log:
    ```bash
    echo '{"trigger":"run","picked":<N>,"done":<X>,"failed":<Y>,"duration_ms":<ms>}' > /tmp/at-log.json
    node scripts/auto-tasks/index.js log-run --json /tmp/at-log.json
    rm /tmp/at-log.json
    ```
11. Print a summary to stdout: `Run complete. Picked <N>, done <X>, failed <Y>. See tasks/archive/ and tasks/processing/.`.

### Subcommand: `verify`

This is the verification autonomous loop — runs every 10 min via cron. Fully non-interactive, idempotent, single-threaded.

Apps run on the host (not Docker). Verification starts `apps/api` and `apps/web` directly from the task's worktree on ephemeral ports `:4101` / `:4100`, so the user's own dev server on `:3001`/`:3000` is never touched and no `git checkout` in the main repo is needed.

1. **Acquire process lock.** Create `.claude/verify.lock` with `O_EXCL`, writing own PID. On `EEXIST`: read PID from lock; if the process is dead → remove stale lock and retry create once; if still fails or the process is alive → log `{"trigger":"verify","skipped":"lock busy"}` via `log-run` and exit. Register a `try/finally` so the lock is always removed before exit, regardless of the code path below.

2. **Crash recovery.** Run `node scripts/auto-tasks/index.js list --status verifying`. Under the lock, any task in `verifying` state belongs to a crashed prior run. For each: kill stale processes from both PID files (see step 3), then build payload `{"acs":[],"notes":"previous verify run crashed — auto-recovered"}`, write to `/tmp/at-verify-recover.json`, run:
   ```bash
   node scripts/auto-tasks/index.js verify-complete --id <id> --json /tmp/at-verify-recover.json
   ```

3. **Stale server cleanup.** Handle both PID files after crash recovery:
   - `.claude/verify-api.pid` — if process is dead → remove file. If alive and no task is in `verifying` → `kill -9 <pid>` and remove file.
   - `.claude/verify-vite.pid` — same logic.

4. **DevTools MCP availability pre-flight.** Verify the `chrome-devtools` MCP tools are reachable (call `mcp__plugin_chrome-devtools-mcp_chrome-devtools__list_pages` and catch errors). If unreachable:
   - Pick the first `awaiting_verification` task (same FIFO order as step 5). `verify-claim` it, then `verify-complete` with payload `{"acs":[],"notes":"DevTools MCP unavailable at verify time"}`. `log-run` with `skipped:"mcp unavailable"` and exit.

5. **List awaiting_verification tasks.** Run `node scripts/auto-tasks/index.js list --status awaiting_verification` and sort by `updated_at` ASC. If empty, `log-run` with `picked:0` and exit.

6. **Claim the oldest task.**
   ```bash
   node scripts/auto-tasks/index.js verify-claim --id <id>
   ```
   Parse `{claimed, task}`. If `claimed:false` (race lost — shouldn't happen under lock), exit.

7. **Resolve paths.**
   ```bash
   REPO_ROOT=$(git rev-parse --show-toplevel)
   WORKTREE="<absolute path — task.frontmatter.worktree, prepend REPO_ROOT if relative>"
   ```
   If `WORKTREE` is not set or the directory does not exist: `verify-complete` with `{"acs":[],"notes":"worktree missing at verify time"}`, cleanup, exit.

8. **Start API from worktree on :4101.** Uses `tsx` (no build step needed) with the main repo's `.env` as base config. `API_PORT=4101` is set before `dotenv` so it takes precedence.
   ```bash
   (cd "$WORKTREE/apps/api" && \
     nohup API_PORT=4101 pnpm exec dotenv -e "$REPO_ROOT/.env" -- \
       pnpm exec tsx server.ts > /tmp/verify-api.log 2>&1 &)
   echo $! > .claude/verify-api.pid
   ```
   Poll `http://localhost:4101/healthz` every 1s up to 30s. On timeout: `verify-complete` with `{"acs":[],"notes":"API startup timeout on :4101"}`, cleanup, exit.

9. **Start Next.js from worktree on :4100.** `NEXT_PUBLIC_API_URL` and `API_URL` overrides point the web app to the worktree's API instance. Both are set before `dotenv` so they take precedence over any values in `.env`.
   ```bash
   (cd "$WORKTREE/apps/web" && \
     nohup NEXT_PUBLIC_API_URL=http://localhost:4101 API_URL=http://localhost:4101 \
       pnpm exec dotenv -e "$REPO_ROOT/.env" -- \
       pnpm exec next dev --port 4100 > /tmp/verify-next.log 2>&1 &)
   echo $! > .claude/verify-vite.pid
   ```

10. **Wait for Next.js readiness.** Poll `http://localhost:4100` with `curl -fsS -o /dev/null` every 1s up to 60s. On timeout: `verify-complete` with `{"acs":[],"notes":"Next.js startup timeout on :4100"}`, cleanup, exit.

11. **Wait for initial compilation, then pre-warm.**
    ```bash
    for i in $(seq 1 60); do
      grep -q "Ready in" /tmp/verify-next.log 2>/dev/null && break
      sleep 1
    done
    curl -fsS -o /dev/null "http://localhost:4100/" || true
    sleep 2
    ```

12. **Dispatch a verification subagent** with `model: "opus"`, `subagent_type: "general-purpose"`. Prompt template:

    > You are a verification agent. The application is running at `http://localhost:4100` (Next.js) backed by the API at `http://localhost:4101` (Hono). Navigate to `http://localhost:4100<task.frontmatter.test_url>` and execute the Repro Steps below. For each Acceptance Criterion, determine if it is met using chrome-devtools MCP tools (navigate_page, take_screenshot, take_snapshot, click, fill, list_console_messages, etc.).
    >
    > Task:
    > `<full markdown body: Context, Acceptance Criteria, Repro Steps, References>`
    >
    > Constraints: READ-ONLY. Do NOT modify files. Do NOT commit. Do NOT run dev commands. Save any screenshots into `<repo_root>/.claude/screenshots/` (this folder is git-ignored) — never write screenshots to project source folders, the repo root, or `/tmp`.
    >
    > Return ONLY a JSON object (no markdown fence, no prose):
    > `{"acs":[{"text":"<exact AC text>","passed":<bool>,"evidence":"<one line>"}],"notes":"<short summary, max 200 chars>"}`

    Hard timeout: 8 minutes.

13. **Handle subagent result.**
    - If the agent response is not valid JSON or it timed out: build payload `{"acs":[],"notes":"agent error: <brief msg>"}`.
    - Otherwise: use the agent's payload directly.
    - Write the payload to `/tmp/at-verify-result.json` and run:
      ```bash
      node scripts/auto-tasks/index.js verify-complete --id <id> --json /tmp/at-verify-result.json
      rm /tmp/at-verify-result.json
      ```
    - On `not_verified`, the CLI automatically writes a `## Verification Report` section into the task body (inserted right after `## Acceptance Criteria`), including per-AC pass/fail with the agent's `evidence`, `notes`, timestamp, and status. The section is overwritten on each re-verify. On `verified`, any prior report is stripped before the task moves to `archive/`.

14. **Cleanup (always, in `try/finally` around steps 6–13).** Stop both servers, then release the lock. Main repo working tree is never touched.
    - If `.claude/verify-api.pid` exists: `kill $(cat .claude/verify-api.pid) 2>/dev/null || true`, wait 3s, if still alive `kill -9 $(cat .claude/verify-api.pid) 2>/dev/null || true`. `rm -f .claude/verify-api.pid`.
    - If `.claude/verify-vite.pid` exists: `kill $(cat .claude/verify-vite.pid) 2>/dev/null || true`, wait 5s, if still alive `kill -9 $(cat .claude/verify-vite.pid) 2>/dev/null || true`. `rm -f .claude/verify-vite.pid`.
    - `rm -f .claude/verify.lock`.

15. **Log run.**
    ```bash
    echo '{"trigger":"verify","picked":<N>,"verified":<X>,"not_verified":<Y>,"duration_ms":<ms>}' > /tmp/at-log.json
    node scripts/auto-tasks/index.js log-run --json /tmp/at-log.json
    rm /tmp/at-log.json
    ```
    Print: `Verify complete. Picked <N>, verified <X>, not_verified <Y>.`

### Subcommand: `retry <id>`

1. Bash: `node scripts/auto-tasks/index.js retry --id <id>`.
2. If `.claude/worktrees/<slug>` exists, remove it so the next run starts fresh:
   ```bash
   git worktree remove .claude/worktrees/<slug> --force 2>/dev/null || true
   git branch -D feature/<slug> 2>/dev/null || true
   ```
3. Print confirmation.

### Subcommand: `cleanup`

Removes tasks that the user has manually marked as integrated — by setting `status: commited` or `status: committed` in the task frontmatter after cherry-picking / committing the work into their own branch. Deletes the task markdown file and the associated git worktree directory. The feature branch is **not** deleted (the user may still want it as a reference).

1. Collect tasks with either spelling by calling `list` twice and merging by id:
   ```bash
   node scripts/auto-tasks/index.js list --status commited  > /tmp/at-commited-1.json
   node scripts/auto-tasks/index.js list --status committed > /tmp/at-commited-2.json
   ```
   Parse both `tasks[]` arrays and concatenate. Deduplicate by `id`.

2. If the merged list is empty: print `No tasks with status 'commited'/'committed' to clean up.` and exit (do not write a run log — this subcommand is user-invoked, not cron).

3. Build a preview and ask for confirmation. Print one line per task:
   ```
   <id>  <dir>  <title>  (worktree: <path or —>)
   ```
   Then use `AskUserQuestion` with options `[yes, delete all / cancel]`. On `cancel` → exit. No mid-loop prompting; one confirmation covers the whole batch.

4. For each task in the confirmed list:
   - **Remove the worktree.** If `task.worktree` is non-null:
     ```bash
     WT="<task.worktree>"
     if [ -d "$WT" ]; then
       git worktree remove "$WT" --force 2>&1 || echo "(worktree remove failed for $WT — skipping worktree, continuing with task deletion)"
     fi
     ```
     `--force` is acceptable here because the user has explicitly declared the work integrated via `status: commited`. Never pass `-D` on the branch — branch preservation is a deliberate choice.
   - **Delete the task file** (second safety net via `--require-status`):
     ```bash
     node scripts/auto-tasks/index.js delete --id <id> --require-status commited,committed
     ```
     If this errors (e.g. status changed between list and delete due to a parallel process), print the error and continue with the remaining tasks.

5. After the loop, prune stale worktree refs:
   ```bash
   git worktree prune
   ```

6. Print summary: `Cleaned up <N> tasks. Worktrees removed: <list>. Feature branches preserved.`

Safety guards:
- Only touches tasks whose frontmatter `status` is exactly `commited` or `committed`.
- Never deletes feature branches.
- `--require-status commited,committed` on the CLI `delete` prevents deletion if another process flipped the status between list and delete.
- Does not write a run-log entry (this is a manual maintenance command, not part of the autonomous loop).

### Subcommand: `install-cron`

1. If `tasks/.cron-id` does NOT exist:
   - Use `CronCreate` with:
     - `cron: "7 * * * *"` (hourly :07)
     - `prompt: "/auto-tasks run"`
     - `recurring: true`, `durable: false`
   - Save the returned id to `tasks/.cron-id`.
2. If `tasks/.cron-id-verify` does NOT exist:
   - Use `CronCreate` with:
     - `cron: "*/10 * * * *"` (every 10 min)
     - `prompt: "/auto-tasks verify"`
     - `recurring: true`, `durable: false`
   - Save the returned id to `tasks/.cron-id-verify`.
3. Print both cron ids and their schedules. If either already existed, note "already installed".

### Subcommand: `uninstall-cron`

1. If `tasks/.cron-id` exists → `CronDelete` the saved id; `rm tasks/.cron-id`.
2. If `tasks/.cron-id-verify` exists → `CronDelete` the saved id; `rm tasks/.cron-id-verify`.
3. If neither file existed before the call, print "no crons installed".
4. Print confirmation listing which crons were removed.

### Subcommand: `plane`

Fetches all Plane work items in state group `unstarted` (Todo) assigned to you, verifies each one live via Chrome DevTools MCP, and creates an auto-task per item with a `## Plane Verification` section capturing what was found.

1. **Get current user.** Call `mcp__plane__get_me`. Record `id` as `<my_id>`.

2. **Fetch todo items.** Call `mcp__plane__list_work_items` with:
   - `assignee_ids: ["<my_id>"]`
   - `state_groups: ["unstarted"]`
   - `workspace_search: true`
   - `limit: 50`

   Collect all returned items. Each item has: `id`, `sequence_id`, `name`, `description_stripped`, `priority`, `project`.

3. **If empty:** print "No unstarted work items assigned to you in Plane." and exit.

4. **Present preview.** Print:
   ```
   Found <N> todo items assigned to you in Plane:
     #1  [<sequence_id>] "<name>"  (priority: <priority>)
     #2  ...
   ```
   Use `AskUserQuestion`: "Proceed with verification and task creation for all <N> items? [yes / cancel]". On cancel → exit.

5. **Pre-flight: check app.** Run:
   ```bash
   curl -fsS -o /dev/null http://localhost:3000/
   ```
   If it fails, ask via `AskUserQuestion`: "Next.js is not running on :3000. Create tasks without live verification (tasks will be marked Skipped)? [yes, skip verification / cancel]". On cancel → exit. On yes → set `skip_verify = true`.

6. **Process each item sequentially** (one Chrome DevTools session at a time):

   a. **Verify live** — unless `skip_verify = true`.
      Dispatch a subagent: `model: "opus"`, `subagent_type: "general-purpose"`.

      Prompt:
      > You are a verification agent for a Plane work item. The app is running at `http://localhost:3000`.
      >
      > **[<sequence_id>] <name>**
      > Priority: <priority>
      > Description:
      > <description_stripped>
      >
      > **Phase 1 — Code review (before opening the browser):**
      > Read the relevant source files in the repo to understand the current implementation.
      > - Grep for symbols, component names, route names, or keywords mentioned in the description.
      > - Read the most likely affected files (`apps/web/src/`, `apps/api/src/`, `packages/db/src/` etc.).
      > - Form a hypothesis: does the code suggest the bug exists / the feature is missing?
      >
      > **Phase 2 — Live verification with Chrome DevTools MCP:**
      > - Use chrome-devtools MCP tools (navigate_page, take_screenshot, click, fill, list_console_messages, take_snapshot) to confirm your hypothesis in the running app.
      > - If this looks like a **bug report**: try to reproduce it. Navigate to where the bug would occur, follow any repro steps from the description.
      > - If this looks like a **feature request or task**: check if it is already implemented in the UI.
      > - Start at `http://localhost:3000` and navigate from there — you decide the path based on the description and what you found in Phase 1.
      > - Save any screenshots into `<repo_root>/.claude/screenshots/` (this folder is git-ignored) — never write screenshots to project source folders, the repo root, or `/tmp`.
      >
      > **Constraints:** READ-ONLY. Do NOT edit files. Do NOT commit. Do NOT restart the server.
      >
      > Return ONLY a JSON object (no markdown fence, no prose):
      > `{"type":"bug"|"feature"|"task","verified":true|false,"reproduced":true|false|null,"test_url":"<relative URL of the most relevant page you visited, or null>","evidence":"<one sentence>","notes":"<max 200 chars>"}`
      >
      > `verified: true` = issue confirmed (bug reproducible OR feature genuinely missing).
      > `verified: false` = cannot confirm (already fixed / already implemented / relevant page not found).

      If the agent response is not valid JSON or times out: use `{"type":"task","verified":false,"reproduced":null,"test_url":null,"evidence":"agent error","notes":"<brief msg>"}`.

   b. **Derive acceptance criterion.** If the item is a bug, the AC is `"<name> is no longer reproducible"`. If it's a feature/task, derive a short imperative AC from `name`.

   c. **Build verification status string** for the `## Plane Verification` section:
      - `skip_verify = true` → `Skipped — app not reachable`
      - `verified: true` → `Confirmed` (+ reproduced field if bug)
      - `verified: false` → `Not confirmed`

   d. **Write payload to `/tmp/at-plane-<sequence_id>.json`:**
      ```json
      {
        "title": "[<sequence_id>] <name>",
        "test_url": "<agent.test_url — include only when non-null>",
        "source": "plane:<sequence_id>",
        "body": "## Context\n\nPlane: [<sequence_id>] <name>\nPriority: <priority>\n\n<description_stripped>\n\n## Acceptance Criteria\n\n- [ ] <derived AC>\n\n## Plane Verification\n\n**Status:** <verification status string>\n**Type:** <type>\n**Reproduced:** <yes / no / n/a>\n**Evidence:** <evidence>\n**Notes:** <notes>\n\n## References\n\n- Plane: <sequence_id>\n- Files: "
      }
      ```
      Include `test_url` only when `agent.test_url` is non-null.

   e. **Create the task:**
      ```bash
      node scripts/auto-tasks/index.js create --json /tmp/at-plane-<sequence_id>.json
      rm /tmp/at-plane-<sequence_id>.json
      ```
      Note the returned `id`.

7. **Print summary:**
   ```
   Imported <N> Plane items as auto-tasks.
     Confirmed:      <X>  (bug reproduced / feature missing)
     Not confirmed:  <Y>  (already fixed / already implemented)
     Skipped:        <Z>  (app not running or no URL in description)

   Created task ids: <list>
   All tasks are status: new. Edit context/ACs as needed, then:
     /auto-tasks approve <id...>
   ```

## Safety rules (apply to all subcommands)

- Never call destructive git commands outside a worktree (no `reset --hard`, `stash`, `checkout .` — per project rule).
- Never auto-merge worktree branches into main — the user always does the final merge.
- Every mutation to a task file goes through the CLI, not direct file writes.
- The `run` subcommand must complete even if individual tasks fail (one bad task doesn't block the others).
