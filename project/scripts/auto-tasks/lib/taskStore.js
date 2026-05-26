const fs = require('node:fs/promises');
const path = require('node:path');
const { parseTaskFile, serializeTaskFile } = require('./frontmatter');

const DIRS = ['inbox', 'processing', 'archive'];

async function readDir(rootDir, dir) {
  try {
    return await fs.readdir(path.join(rootDir, dir));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function parseFilename(name) {
  const m = name.match(/^(\d{4}-\d{2}-\d{2}-\d{3})(?:-(.+?))?\.md$/);
  if (!m) return null;
  return { id: m[1], slug: m[2] || '' };
}

async function loadTaskFromFile(rootDir, dir, filename) {
  const full = path.join(rootDir, dir, filename);
  const raw = await fs.readFile(full, 'utf8');
  const parsed = parseTaskFile(raw);
  if (!parsed) return null;
  const meta = parseFilename(filename);
  if (!meta) return null;
  return {
    id: meta.id,
    slug: meta.slug,
    filename,
    dir,
    path: full,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
  };
}

async function listTasks(rootDir, { status } = {}) {
  const out = [];
  for (const dir of DIRS) {
    const names = await readDir(rootDir, dir);
    for (const name of names) {
      if (!name.endsWith('.md')) continue;
      const task = await loadTaskFromFile(rootDir, dir, name);
      if (!task) continue;
      if (status && task.frontmatter.status !== status) continue;
      out.push(task);
    }
  }
  return out;
}

async function readTask(rootDir, id) {
  const matches = [];
  for (const dir of DIRS) {
    const names = await readDir(rootDir, dir);
    for (const name of names) {
      const parsed = parseFilename(name);
      if (parsed && parsed.id === id) matches.push({ dir, name });
    }
  }
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(`task ${id} exists in multiple dirs: ${matches.map((m) => m.dir).join(', ')}`);
  }
  return loadTaskFromFile(rootDir, matches[0].dir, matches[0].name);
}

async function writeTask(rootDir, dir, { id, slug, frontmatter, body }) {
  const filename = slug ? `${id}-${slug}.md` : `${id}.md`;
  const full = path.join(rootDir, dir, filename);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, serializeTaskFile(frontmatter, body));
  return loadTaskFromFile(rootDir, dir, filename);
}

async function atomicClaim(rootDir, id, patch) {
  const task = await readTask(rootDir, id);
  if (!task) return null;

  // Recovery: task partially claimed previously (rename succeeded but patch failed).
  // Detect by: currently in processing/ but still has for_dev status.
  if (task.dir === 'processing' && task.frontmatter.status === 'for_dev') {
    const updatedFm = { ...task.frontmatter, ...patch };
    await fs.writeFile(task.path, serializeTaskFile(updatedFm, task.body));
    return loadTaskFromFile(rootDir, 'processing', task.filename);
  }

  if (task.dir !== 'inbox') return null;
  if (task.frontmatter.status !== 'for_dev') return null;

  const srcPath = task.path;
  const dstPath = path.join(rootDir, 'processing', task.filename);

  try {
    await fs.mkdir(path.join(rootDir, 'processing'), { recursive: true });
    await fs.rename(srcPath, dstPath);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }

  const updatedFm = { ...task.frontmatter, ...patch };
  await fs.writeFile(dstPath, serializeTaskFile(updatedFm, task.body));
  return loadTaskFromFile(rootDir, 'processing', task.filename);
}

async function moveToArchive(rootDir, id, patch) {
  const task = await readTask(rootDir, id);
  if (!task) throw new Error(`task not found: ${id}`);
  const srcPath = task.path;
  const dstPath = path.join(rootDir, 'archive', task.filename);
  await fs.mkdir(path.join(rootDir, 'archive'), { recursive: true });
  await fs.rename(srcPath, dstPath);
  const updatedFm = { ...task.frontmatter, ...patch };
  await fs.writeFile(dstPath, serializeTaskFile(updatedFm, task.body));
  return loadTaskFromFile(rootDir, 'archive', task.filename);
}

async function moveToInbox(rootDir, id, patch = {}) {
  const task = await readTask(rootDir, id);
  if (!task) throw new Error(`task not found: ${id}`);
  const srcPath = task.path;
  const dstPath = path.join(rootDir, 'inbox', task.filename);
  await fs.mkdir(path.join(rootDir, 'inbox'), { recursive: true });
  await fs.rename(srcPath, dstPath);
  const updatedFm = { ...task.frontmatter, ...patch };
  await fs.writeFile(dstPath, serializeTaskFile(updatedFm, task.body));
  return loadTaskFromFile(rootDir, 'inbox', task.filename);
}

async function markFailed(rootDir, id, errorMessage) {
  const task = await readTask(rootDir, id);
  if (!task) throw new Error(`task not found: ${id}`);
  const updatedFm = {
    ...task.frontmatter,
    status: 'failed',
    last_error: errorMessage,
    updated_at: new Date().toISOString(),
  };
  await fs.writeFile(task.path, serializeTaskFile(updatedFm, task.body));
  return loadTaskFromFile(rootDir, task.dir, task.filename);
}

async function transitionStatusInPlace(rootDir, id, { fromStatus, patch }) {
  const task = await readTask(rootDir, id);
  if (!task) return null;
  if (task.frontmatter.status !== fromStatus) return null;
  const updatedFm = {
    ...task.frontmatter,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  await fs.writeFile(task.path, serializeTaskFile(updatedFm, task.body));
  return loadTaskFromFile(rootDir, task.dir, task.filename);
}

module.exports = {
  listTasks, readTask, writeTask, atomicClaim, moveToArchive, moveToInbox, markFailed, transitionStatusInPlace,
};
