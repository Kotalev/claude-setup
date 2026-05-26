const FM_RE = /^---\n([\s\S]*?)\n---\n*([\s\S]*)$/;

function parseValue(raw) {
  const v = raw.trim();
  if (v === '' || v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === '[]') return [];
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
  // Array of strings: ["a", "b"]
  const arrMatch = v.match(/^\[\s*(.*?)\s*\]$/);
  if (arrMatch) {
    if (arrMatch[1] === '') return [];
    return arrMatch[1].split(',').map((s) => {
      const t = s.trim();
      return /^"(.*)"$/.test(t) ? t.slice(1, -1) : t;
    });
  }
  // Quoted string
  const qm = v.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (qm) return decodeEscapes(qm[1]);
  // Bare string
  return v;
}

function decodeEscapes(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      const next = s[i + 1];
      if (next === 'n') { out += '\n'; i++; continue; }
      if (next === '"') { out += '"'; i++; continue; }
      if (next === '\\') { out += '\\'; i++; continue; }
    }
    out += c;
  }
  return out;
}

function parseTaskFile(raw) {
  const m = String(raw).match(FM_RE);
  if (!m) return null;
  const [, yaml, body] = m;
  const frontmatter = {};
  for (const line of yaml.split('\n')) {
    const km = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!km) continue;
    frontmatter[km[1]] = parseValue(km[2]);
  }
  return { frontmatter, body };
}

function serializeValue(val) {
  if (val === null || val === undefined) return 'null';
  if (val === true || val === false) return String(val);
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    return '[' + val.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(', ') + ']';
  }
  const s = String(val);
  if (/[:"'\n#\[\]]/.test(s)) {
    const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    return `"${escaped}"`;
  }
  return s;
}

function serializeTaskFile(frontmatter, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(frontmatter)) {
    lines.push(`${k}: ${serializeValue(v)}`);
  }
  lines.push('---', '', body.replace(/\n*$/, '\n'));
  return lines.join('\n');
}

function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

module.exports = { parseTaskFile, serializeTaskFile, slugify };
