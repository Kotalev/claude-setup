function nextId(dateStr, existingIds) {
  const prefix = `${dateStr}-`;
  let maxSeq = 0;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const seq = parseInt(id.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

module.exports = { nextId };
