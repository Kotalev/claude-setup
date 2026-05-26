const fs = require('node:fs/promises');
const path = require('node:path');

const CONFIG_FILE = 'auto-tasks.config.json';

function baseDefaults() {
  return {
    packageManager: 'npm',
    worktree: { root: '.claude/worktrees', branchPrefix: 'feature/' },
    moduleRoots: [],
    projectRules: [],
    reviewerAgent: 'elite-code-reviewer',
    verify: { enabled: false, mode: 'worktree', envFile: '.env', browserApp: null, apps: [] },
  };
}

function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }

function normalizeConfig(raw = {}) {
  const d = baseDefaults();
  const r = obj(raw);
  const pm = r.packageManager || d.packageManager;
  const v = obj(r.verify);
  const apps = Array.isArray(v.apps) ? v.apps : d.verify.apps;
  return {
    packageManager: pm,
    install: r.install || `${pm} install`,
    test: r.test || `${pm} test`,
    worktree: { ...d.worktree, ...obj(r.worktree) },
    moduleRoots: Array.isArray(r.moduleRoots) ? r.moduleRoots : d.moduleRoots,
    projectRules: Array.isArray(r.projectRules) ? r.projectRules : d.projectRules,
    reviewerAgent: r.reviewerAgent || d.reviewerAgent,
    verify: {
      enabled: v.enabled !== undefined ? !!v.enabled : apps.length > 0,
      mode: v.mode || d.verify.mode,
      envFile: v.envFile || d.verify.envFile,
      browserApp: v.browserApp || (apps[0] && apps[0].name) || null,
      apps,
    },
  };
}

function validateConfig(cfg) {
  const errors = [];
  if (!['worktree', 'checkout'].includes(cfg.verify.mode)) {
    errors.push(`verify.mode must be 'worktree' or 'checkout' (got '${cfg.verify.mode}')`);
  }
  const names = new Set();
  cfg.verify.apps.forEach((app, i) => {
    if (!app.name) errors.push(`verify.apps[${i}].name is required`);
    if (!app.cwd) errors.push(`verify.apps[${i}].cwd is required`);
    if (!app.start) errors.push(`verify.apps[${i}].start is required`);
    if (typeof app.port !== 'number') errors.push(`verify.apps[${i}].port must be a number`);
    if (app.name) {
      if (names.has(app.name)) errors.push(`duplicate app name '${app.name}'`);
      names.add(app.name);
    }
  });
  if (cfg.verify.browserApp && !names.has(cfg.verify.browserApp)) {
    errors.push(`verify.browserApp '${cfg.verify.browserApp}' does not match any app`);
  }
  if (errors.length) throw new Error('invalid config: ' + errors.join('; '));
  return cfg;
}

async function loadConfig(tasksDir) {
  const file = path.join(tasksDir, CONFIG_FILE);
  let raw = {};
  try { raw = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
  return normalizeConfig(raw);
}

async function writeConfig(tasksDir, payload) {
  const normalized = validateConfig(normalizeConfig(payload));
  const file = path.join(tasksDir, CONFIG_FILE);
  await fs.mkdir(tasksDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  return file;
}

module.exports = { CONFIG_FILE, baseDefaults, normalizeConfig, validateConfig, loadConfig, writeConfig };
