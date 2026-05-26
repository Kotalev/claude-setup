function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markAC(body, acText, passed) {
  const trimmed = acText.trim();
  if (!trimmed) return body;
  const marker = passed ? '- [x]' : '- [ ]';
  const re = new RegExp(`- \\[[ x]\\]\\s+${escapeRegex(trimmed)}(?=\\s|$)`, 'gm');
  return body.replace(re, `${marker} ${trimmed}`);
}

function markACs(body, acs) {
  return (acs || []).reduce((b, ac) => markAC(b, ac.text, ac.passed), body);
}

function stripVerificationReport(body) {
  const start = body.search(/## Verification Report\b/);
  if (start === -1) return body;
  const afterHeader = start + '## Verification Report'.length;
  const nextSectionRel = body.slice(afterHeader).search(/\n## /);
  const end = nextSectionRel === -1 ? body.length : afterHeader + nextSectionRel;
  const before = body.slice(0, start).replace(/\n+$/, '\n');
  let after = body.slice(end);
  if (after.startsWith('\n')) after = after.replace(/^\n+/, '\n');
  if (before === '' && after.startsWith('\n')) after = after.slice(1);
  return before + after;
}

function buildVerificationReport({ acs, notes, timestamp, status }) {
  const lines = ['## Verification Report', ''];
  lines.push(`_Generated: ${timestamp} — status: ${status}_`);
  lines.push('');
  const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';
  if (trimmedNotes) {
    lines.push(`**Notes:** ${trimmedNotes}`);
    lines.push('');
  }
  if (Array.isArray(acs) && acs.length > 0) {
    for (const ac of acs) {
      const icon = ac.passed ? '✅' : '❌';
      const text = (ac.text || '').trim() || '(no text)';
      const evidence = (ac.evidence || '').trim() || '(no evidence)';
      lines.push(`- ${icon} ${text} — ${evidence}`);
    }
  } else {
    lines.push('_No acceptance criteria evaluated._');
  }
  return lines.join('\n') + '\n';
}

function writeVerificationReport(body, opts) {
  const cleaned = stripVerificationReport(body);
  const report = buildVerificationReport(opts);

  const acStart = cleaned.search(/## Acceptance Criteria\b/);
  if (acStart === -1) {
    const base = cleaned.replace(/\n*$/, '');
    const sep = base === '' ? '' : '\n\n';
    return base + sep + report;
  }

  const afterAcHeader = acStart + '## Acceptance Criteria'.length;
  const nextSectionRel = cleaned.slice(afterAcHeader).search(/\n## /);
  const acEnd = nextSectionRel === -1 ? cleaned.length : afterAcHeader + nextSectionRel;

  const acPart = cleaned.slice(0, acEnd).replace(/\n+$/, '\n');
  let rest = cleaned.slice(acEnd);
  if (rest.startsWith('\n')) rest = rest.replace(/^\n+/, '\n');

  return `${acPart}\n${report}${rest}`;
}

module.exports = { markAC, markACs, stripVerificationReport, writeVerificationReport };
