const fs = require('node:fs/promises');
const path = require('node:path');

const LOG_FILE = '.run-log.jsonl';

async function appendRunLog(rootDir, entry) {
  const full = path.join(rootDir, LOG_FILE);
  const record = { ts: new Date().toISOString(), ...entry };
  await fs.appendFile(full, JSON.stringify(record) + '\n', 'utf8');
}

async function readRunLog(rootDir) {
  const full = path.join(rootDir, LOG_FILE);
  try {
    const text = await fs.readFile(full, 'utf8');
    return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

module.exports = { appendRunLog, readRunLog };
