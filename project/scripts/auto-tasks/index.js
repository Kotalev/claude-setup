#!/usr/bin/env node
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const {
  listTasks, readTask, writeTask, atomicClaim, moveToInbox, markFailed, transitionStatusInPlace,
} = require('./lib/taskStore');
const { nextId } = require('./lib/idGenerator');
const { slugify, serializeTaskFile } = require('./lib/frontmatter');
const { appendRunLog } = require('./lib/runLog');
const { groupCandidates, detectModule } = require('./lib/grouping');
const { markACs, writeVerificationReport, stripVerificationReport } = require('./lib/acUpdater');
const { loadConfig, writeConfig } = require('./lib/config');

// ---- arg parsing ----
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) { out[key] = true; } else { out[key] = next; i++; }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function findRepoRoot(start) {
  let d = start;
  while (true) {
    if (fsSync.existsSync(path.join(d, '.git'))) return d;
    const parent = path.dirname(d);
    if (parent === d) throw new Error('repo root not found (no .git)');
    d = parent;
  }
}

function tasksRoot(args) {
  const root = args.root || findRepoRoot(process.cwd());
  return path.join(root, 'tasks');
}

function print(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

// ---- subcommands ----
async function cmdListIds(args) {
  const tasks = await listTasks(tasksRoot(args));
  print({ ids: tasks.map((t) => t.id) });
}

async function cmdList(args) {
  const tasks = await listTasks(tasksRoot(args), { status: args.status });
  print({ tasks: tasks.map((t) => ({
    id: t.id,
    dir: t.dir,
    title: t.frontmatter.title,
    status: t.frontmatter.status,
    priority: t.frontmatter.priority,
    agent: t.frontmatter.agent || null,
    worktree: t.frontmatter.worktree,
    branch: t.frontmatter.branch,
    attempts: t.frontmatter.attempts,
    last_error: t.frontmatter.last_error,
  })) });
}

async function cmdNextId(args) {
  if (!args.date) throw new Error('--date YYYY-MM-DD required');
  const tasks = await listTasks(tasksRoot(args));
  print({ id: nextId(args.date, tasks.map((t) => t.id)) });
}

async function cmdCreate(args) {
  if (!args.json) throw new Error('--json <path> required');
  const payload = JSON.parse(await fs.readFile(args.json, 'utf8'));
  if (!payload.title) throw new Error('payload.title required');
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const tasks = await listTasks(tasksRoot(args));
  const id = nextId(date, tasks.map((t) => t.id));
  const slug = payload.slug || slugify(payload.title);
  const frontmatter = {
    id,
    title: payload.title,
    status: payload.status || 'new',
    priority: payload.priority || 'normal',
    agent: payload.agent || null,
    created_at: now,
    updated_at: now,
    worktree: null,
    branch: null,
    review_score: null,
    attempts: 0,
    last_error: null,
    source: payload.source || null,
    merged_from: payload.merged_from || [],
    test_url: payload.test_url || null,
  };
  const written = await writeTask(tasksRoot(args), 'inbox', {
    id, slug, frontmatter, body: payload.body || '## Context\n\n## Acceptance Criteria\n\n## References\n',
  });
  print({ id, path: written.path });
}

async function cmdClaim(args) {
  const { id, worktree, branch } = args;
  if (!id || !worktree || !branch) throw new Error('--id, --worktree, --branch required');
  const now = new Date().toISOString();
  const patch = { status: 'processing', worktree, branch, updated_at: now };
  const task = await atomicClaim(tasksRoot(args), id, patch);
  print(task ? { claimed: true, task } : { claimed: false });
}

async function cmdCompleteDev(args) {
  const { id } = args;
  if (!id) throw new Error('--id required');
  const score = args['review-score'] != null ? parseInt(args['review-score'], 10) : null;
  const root = tasksRoot(args);
  const task = await readTask(root, id);
  if (!task) throw new Error(`task not found: ${id}`);
  if (task.frontmatter.status !== 'processing') {
    throw new Error(`task ${id} is not in 'processing' (status: ${task.frontmatter.status})`);
  }
  // Every completed task goes to verification. When test_url is set the verify
  // agent opens it directly; when it's null the agent finds the right page itself.
  const patch = { status: 'awaiting_verification', review_score: score };
  await transitionStatusInPlace(root, id, { fromStatus: 'processing', patch });
  print({ id, status: 'awaiting_verification' });
}

async function cmdVerifyClaim(args) {
  const { id } = args;
  if (!id) throw new Error('--id required');
  const root = tasksRoot(args);
  const result = await transitionStatusInPlace(root, id, {
    fromStatus: 'awaiting_verification',
    patch: { status: 'verifying' },
  });
  if (!result) {
    print({ claimed: false });
    return;
  }
  print({ claimed: true, task: { id: result.id, frontmatter: result.frontmatter } });
}

async function cmdVerifyComplete(args) {
  const { id } = args;
  if (!id || !args.json) throw new Error('--id and --json required');
  const payload = JSON.parse(await fs.readFile(args.json, 'utf8'));
  const acs = Array.isArray(payload.acs) ? payload.acs : [];
  const notes = typeof payload.notes === 'string' ? payload.notes.slice(0, 500) : null;
  const allPassed = acs.length > 0 && acs.every((a) => a.passed === true);

  const root = tasksRoot(args);
  const task = await readTask(root, id);
  if (!task) throw new Error(`task not found: ${id}`);
  if (task.frontmatter.status !== 'verifying') {
    throw new Error(`task ${id} is not in 'verifying' (status: ${task.frontmatter.status})`);
  }

  const now = new Date().toISOString();
  const bodyWithTicks = markACs(task.body, acs);

  if (allPassed) {
    const patch = { status: 'verified', verified_at: now, verify_notes: notes, updated_at: now };
    const finalBody = stripVerificationReport(bodyWithTicks);
    const dstPath = path.join(root, 'archive', task.filename);
    await fs.mkdir(path.join(root, 'archive'), { recursive: true });
    await fs.rename(task.path, dstPath);
    await fs.writeFile(dstPath, serializeTaskFile({ ...task.frontmatter, ...patch }, finalBody));
    print({ id, status: 'verified' });
    return;
  }

  const patch = { status: 'not_verified', verified_at: now, verify_notes: notes, updated_at: now };
  const finalBody = writeVerificationReport(bodyWithTicks, {
    acs, notes, timestamp: now, status: 'not_verified',
  });
  await fs.writeFile(task.path, serializeTaskFile({ ...task.frontmatter, ...patch }, finalBody));
  print({ id, status: 'not_verified' });
}

async function cmdMigrateFields(args) {
  const root = tasksRoot(args);
  const tasks = await listTasks(root);
  const newFields = ['test_url', 'verified_at', 'verify_notes'];
  let migrated = 0;
  for (const t of tasks) {
    const missing = newFields.filter((k) => !(k in t.frontmatter));
    if (missing.length === 0) continue;
    const patched = { ...t.frontmatter };
    for (const k of missing) patched[k] = null;
    await fs.writeFile(t.path, serializeTaskFile(patched, t.body));
    migrated++;
  }
  print({ migrated });
}

async function cmdFail(args) {
  const { id } = args;
  if (!id) throw new Error('--id required');
  await markFailed(tasksRoot(args), id, args.error || 'unknown error');
  print({ id });
}

async function cmdRetry(args) {
  const { id } = args;
  if (!id) throw new Error('--id required');
  const root = tasksRoot(args);
  const task = await readTask(root, id);
  if (!task) throw new Error(`task not found: ${id}`);
  const patch = {
    status: 'for_dev',
    last_error: null,
    attempts: (task.frontmatter.attempts || 0) + 1,
    worktree: null,
    branch: null,
    updated_at: new Date().toISOString(),
  };
  await moveToInbox(root, id, patch);
  print({ id });
}

async function cmdDelete(args) {
  const { id } = args;
  if (!id) throw new Error('--id required');
  const root = tasksRoot(args);
  const task = await readTask(root, id);
  if (!task) throw new Error(`task not found: ${id}`);
  const requireStatus = args['require-status'];
  if (requireStatus) {
    const allowed = String(requireStatus).split(',').map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(task.frontmatter.status)) {
      throw new Error(`task ${id} has status '${task.frontmatter.status}', expected one of: ${allowed.join(', ')}`);
    }
  }
  await fs.unlink(task.path);
  print({
    id,
    path: task.path,
    dir: task.dir,
    worktree: task.frontmatter.worktree || null,
    branch: task.frontmatter.branch || null,
  });
}

async function cmdApprove(args) {
  const { id } = args;
  if (!id) throw new Error('--id required');
  const root = tasksRoot(args);
  const task = await readTask(root, id);
  if (!task) throw new Error(`task not found: ${id}`);
  if (task.frontmatter.status !== 'new') throw new Error(`task ${id} is not 'new' (status: ${task.frontmatter.status})`);
  const updated = { ...task.frontmatter, status: 'for_dev', updated_at: new Date().toISOString() };
  await fs.writeFile(task.path, serializeTaskFile(updated, task.body));
  print({ id });
}

async function cmdAppendCriterion(args) {
  const { id, text } = args;
  if (!id || !text) throw new Error('--id and --text required');
  const root = tasksRoot(args);
  const task = await readTask(root, id);
  if (!task) throw new Error(`task not found: ${id}`);
  let body = task.body;
  if (/## Acceptance Criteria/.test(body)) {
    body = body.replace(/(## Acceptance Criteria\n)/, `$1- [ ] ${text}\n`);
  } else {
    body += `\n## Acceptance Criteria\n- [ ] ${text}\n`;
  }
  const updated = { ...task.frontmatter, updated_at: new Date().toISOString() };
  await fs.writeFile(task.path, serializeTaskFile(updated, body));
  print({ id });
}

async function cmdGroupCandidates(args) {
  if (!args.json) throw new Error('--json required');
  const cands = JSON.parse(await fs.readFile(args.json, 'utf8'));
  const { moduleRoots } = await loadConfig(tasksRoot(args));
  print(groupCandidates(cands, moduleRoots));
}

function extractFilesFromBody(body) {
  const files = [];
  const m = body.match(/## References[\s\S]*?(?=\n##|\n*$)/);
  if (!m) return files;
  for (const line of m[0].split('\n')) {
    const fm = line.match(/-\s+Files?:\s*(.*)/i);
    if (fm) {
      fm[1].split(/,\s*/).forEach((f) => files.push(f.replace(/:\d+$/, '').trim()));
    }
  }
  return files;
}

async function cmdFindRelated(args) {
  if (!args.json) throw new Error('--json required');
  const input = JSON.parse(await fs.readFile(args.json, 'utf8'));
  const { moduleRoots } = await loadConfig(tasksRoot(args));
  const inputFiles = new Set(input.files || []);
  const inputModules = new Set([...inputFiles].map((f) => detectModule(f, moduleRoots)).filter(Boolean));
  const tasks = await listTasks(tasksRoot(args));
  const matches = [];
  for (const t of tasks) {
    if (!['new', 'for_dev'].includes(t.frontmatter.status)) continue;
    const taskFiles = extractFilesFromBody(t.body);
    const taskModules = new Set(taskFiles.map((f) => detectModule(f, moduleRoots)).filter(Boolean));
    const overlapFiles = taskFiles.filter((f) => inputFiles.has(f));
    const overlapModules = [...taskModules].filter((m) => inputModules.has(m));
    if (overlapFiles.length > 0 || overlapModules.length > 0) {
      matches.push({
        id: t.id,
        title: t.frontmatter.title,
        status: t.frontmatter.status,
        overlapFiles,
        overlapModules,
      });
    }
  }
  print({ matches });
}

async function cmdConfig(args) {
  const tasksDir = tasksRoot(args);
  if (args.set) {
    const payload = JSON.parse(await fs.readFile(args.set, 'utf8'));
    const file = await writeConfig(tasksDir, payload);
    print({ ok: true, path: file });
    return;
  }
  print(await loadConfig(tasksDir));
}

async function cmdLogRun(args) {
  if (!args.json) throw new Error('--json required');
  const entry = JSON.parse(await fs.readFile(args.json, 'utf8'));
  const root = args.root || findRepoRoot(process.cwd());
  await appendRunLog(path.join(root, 'tasks'), entry);
  print({ ok: true });
}

// ---- dispatch ----
const commands = {
  'list-ids': cmdListIds,
  'list': cmdList,
  'next-id': cmdNextId,
  'create': cmdCreate,
  'claim': cmdClaim,
  'complete-dev': cmdCompleteDev,
  'verify-claim': cmdVerifyClaim,
  'verify-complete': cmdVerifyComplete,
  'migrate-fields': cmdMigrateFields,
  'fail': cmdFail,
  'retry': cmdRetry,
  'approve': cmdApprove,
  'delete': cmdDelete,
  'append-criterion': cmdAppendCriterion,
  'group-candidates': cmdGroupCandidates,
  'find-related': cmdFindRelated,
  'config': cmdConfig,
  'log-run': cmdLogRun,
  'help': () => console.log('Subcommands: ' + Object.keys(commands).join(', ')),
};

const [, , sub, ...rest] = process.argv;
const fn = commands[sub] || commands.help;
const args = parseArgs(rest);
Promise.resolve(fn(args)).catch((err) => {
  process.stderr.write(`auto-tasks: ${err?.message || err}\n`);
  process.exit(1);
});
