#!/usr/bin/env bash
# parse-coverage.sh — Phase 5 helper for refresh-tests
# Parse a coverage report into a unified per-file format.
#
# Usage: parse-coverage.sh <runner> <report-path>
#   runner: jest | vitest | c8 | pytest | go | jacoco | dotnet
#   report-path:
#     - Jest/Vitest/c8: path to coverage-summary.json
#     - pytest: path to coverage.json
#     - go: path to `go tool cover -func` output (or coverprofile to be processed)
#     - jacoco: path to jacoco.xml
#     - dotnet: path to coverage.cobertura.xml
#
# Stdout (one line per file, plus a "TOTAL" line):
#   TOTAL <stmt_pct> <branch_pct> <line_pct>
#   <file> <stmt_pct> <branch_pct> <line_pct>
#
# Missing metrics are emitted as "n/a".

set -euo pipefail

RUNNER="${1:-}"
REPORT="${2:-}"

if [[ -z "$RUNNER" || -z "$REPORT" ]]; then
  echo "usage: parse-coverage.sh <runner> <report-path>" >&2
  exit 2
fi
if [[ ! -f "$REPORT" ]]; then
  echo "report not found: $REPORT" >&2
  exit 2
fi

case "$RUNNER" in
  jest|vitest|c8)
    # coverage-summary.json: { "total": {...}, "<abs path>": {...}, ... }
    # Each entry has .statements.pct, .branches.pct, .lines.pct
    if command -v node >/dev/null 2>&1; then
      node -e "
        const d = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
        const fmt = (v) => (v == null ? 'n/a' : (Math.round(v * 10) / 10).toString());
        for (const [k, v] of Object.entries(d)) {
          const s = v.statements ? v.statements.pct : null;
          const b = v.branches ? v.branches.pct : null;
          const l = v.lines ? v.lines.pct : null;
          const label = k === 'total' ? 'TOTAL' : k;
          console.log(label + ' ' + fmt(s) + ' ' + fmt(b) + ' ' + fmt(l));
        }
      " "$REPORT"
    elif command -v python3 >/dev/null 2>&1; then
      python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
fmt = lambda v: 'n/a' if v is None else f'{round(v, 1)}'
for k, v in d.items():
    s = v.get('statements', {}).get('pct')
    b = v.get('branches', {}).get('pct')
    l = v.get('lines', {}).get('pct')
    label = 'TOTAL' if k == 'total' else k
    print(f'{label} {fmt(s)} {fmt(b)} {fmt(l)}')
" "$REPORT"
    else
      echo "node or python3 required to parse $RUNNER coverage" >&2
      exit 3
    fi
    ;;

  pytest)
    # coverage.json structure (coverage.py >=5):
    # { "files": { "<path>": { "summary": { "percent_covered": N, "covered_lines": N, "num_statements": N } } },
    #   "totals": { "percent_covered": N } }
    if command -v python3 >/dev/null 2>&1; then
      python3 -c "
import json, sys
d = json.load(open(sys.argv[1]))
fmt = lambda v: 'n/a' if v is None else f'{round(v, 1)}'
for path, info in d.get('files', {}).items():
    s = info.get('summary', {}).get('percent_covered')
    print(f'{path} {fmt(s)} n/a {fmt(s)}')
t = d.get('totals', {}).get('percent_covered')
print(f'TOTAL {fmt(t)} n/a {fmt(t)}')
" "$REPORT"
    else
      echo "python3 required to parse pytest coverage" >&2
      exit 3
    fi
    ;;

  go)
    # `go tool cover -func` output:
    #   <file>:<line>:<column>      <name>          NN.N%
    #   total:                      (statements)    NN.N%
    awk '
      /^total:/ { total = $NF }
      !/^total:/ {
        # Strip trailing % from $NF
        pct = $NF
        sub(/%$/, "", pct)
        # Group by file (everything before first :)
        split($1, parts, ":")
        file = parts[1]
        sum[file] += pct
        count[file]++
      }
      END {
        for (f in sum) {
          avg = sum[f] / count[f]
          printf "%s %.1f n/a %.1f\n", f, avg, avg
        }
        sub(/%$/, "", total)
        printf "TOTAL %s n/a %s\n", total, total
      }
    ' "$REPORT"
    ;;

  jacoco)
    # jacoco.xml: <package><class name=".."><counter type="LINE" missed="N" covered="N"/></class>...</package>
    if command -v python3 >/dev/null 2>&1; then
      python3 -c "
import xml.etree.ElementTree as ET, sys
root = ET.parse(sys.argv[1]).getroot()
def pct(missed, covered):
    total = missed + covered
    if total == 0: return None
    return round(100.0 * covered / total, 1)
def fmt(v):
    return 'n/a' if v is None else str(v)
totals = {'LINE': [0,0], 'BRANCH': [0,0], 'INSTRUCTION': [0,0]}
for cls in root.iter('class'):
    name = cls.get('sourcefilename') or cls.get('name')
    counters = {c.get('type'): (int(c.get('missed', 0)), int(c.get('covered', 0))) for c in cls.findall('counter')}
    s = pct(*counters.get('INSTRUCTION', (0,0)))
    b = pct(*counters.get('BRANCH', (0,0)))
    l = pct(*counters.get('LINE', (0,0)))
    print(f'{name} {fmt(s)} {fmt(b)} {fmt(l)}')
    for k, (m, c) in counters.items():
        if k in totals:
            totals[k][0] += m; totals[k][1] += c
s = pct(*totals['INSTRUCTION'])
b = pct(*totals['BRANCH'])
l = pct(*totals['LINE'])
print(f'TOTAL {fmt(s)} {fmt(b)} {fmt(l)}')
" "$REPORT"
    else
      echo "python3 required to parse jacoco xml" >&2
      exit 3
    fi
    ;;

  dotnet)
    # Cobertura XML: <packages><package line-rate="N"><classes><class filename="..." line-rate="N" branch-rate="N">
    if command -v python3 >/dev/null 2>&1; then
      python3 -c "
import xml.etree.ElementTree as ET, sys
root = ET.parse(sys.argv[1]).getroot()
def pct(rate):
    if rate is None: return None
    try: return round(float(rate) * 100, 1)
    except: return None
def fmt(v):
    return 'n/a' if v is None else str(v)
for cls in root.iter('class'):
    f = cls.get('filename')
    l = pct(cls.get('line-rate'))
    b = pct(cls.get('branch-rate'))
    print(f'{f} {fmt(l)} {fmt(b)} {fmt(l)}')
overall = pct(root.get('line-rate'))
overall_b = pct(root.get('branch-rate'))
print(f'TOTAL {fmt(overall)} {fmt(overall_b)} {fmt(overall)}')
" "$REPORT"
    else
      echo "python3 required to parse cobertura xml" >&2
      exit 3
    fi
    ;;

  *)
    echo "unknown runner: $RUNNER" >&2
    echo "supported: jest, vitest, c8, pytest, go, jacoco, dotnet" >&2
    exit 2
    ;;
esac
