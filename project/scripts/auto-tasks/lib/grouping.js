function globToRegex(glob) {
  const escaped = String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+');
  return new RegExp('^' + escaped);
}

function detectModule(filePath, moduleRoots = []) {
  for (const g of moduleRoots) {
    const m = String(filePath).match(globToRegex(g));
    if (m) return m[0];
  }
  return null;
}

function normalizeTopic(t) {
  if (typeof t !== 'string') return '';
  return t.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function groupCandidates(candidates, moduleRoots = []) {
  const n = candidates.length;
  if (n === 0) return { groups: [], standalone: [] };

  // Precompute modules + normalized topic per candidate
  const meta = candidates.map((c) => {
    const modules = new Set();
    for (const f of c.files || []) {
      const m = detectModule(f, moduleRoots);
      if (m) modules.add(m);
    }
    return {
      ...c,
      files: c.files || [],
      modules: [...modules],
      topic: normalizeTopic(c.topic),
    };
  });

  // Union-find
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sharedFile = meta[i].files.some((f) => meta[j].files.includes(f));
      const sharedModule = meta[i].modules.some((m) => meta[j].modules.includes(m));
      const sharedTopic = !!meta[i].topic && meta[i].topic === meta[j].topic;
      if (sharedFile || sharedModule || sharedTopic) union(i, j);
    }
  }

  // Bucket by component root
  const buckets = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r).push(meta[i]);
  }

  const groups = [];
  const standalone = [];
  for (const items of buckets.values()) {
    if (items.length === 1) {
      standalone.push(items[0]);
      continue;
    }
    const commonFiles = items
      .map((x) => new Set(x.files))
      .reduce((a, b) => new Set([...a].filter((f) => b.has(f))));
    const moduleCounts = {};
    for (const it of items) {
      for (const m of it.modules) moduleCounts[m] = (moduleCounts[m] || 0) + 1;
    }
    const module = Object.entries(moduleCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topicCounts = {};
    for (const it of items) {
      if (it.topic) topicCounts[it.topic] = (topicCounts[it.topic] || 0) + 1;
    }
    const topic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    groups.push({
      title: null,
      items,
      commonFiles: [...commonFiles],
      module: module || null,
      topic,
    });
  }

  return { groups, standalone };
}

module.exports = { detectModule, groupCandidates, normalizeTopic };
