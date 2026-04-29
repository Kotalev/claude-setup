#!/usr/bin/env bash
# run-scanners.sh — broader-scope scanner invocation for the `security` skill.
#
# Usage:
#   run-scanners.sh                   # scan staged + unstaged changes vs HEAD
#   run-scanners.sh diff              # same as above
#   run-scanners.sh diff <ref>        # scan diff vs a specific git ref
#   run-scanners.sh path <path>       # scan a file or directory
#
# Detects semgrep, gitleaks, trivy. Skips any that are not installed.
# Outputs a unified markdown report on stdout.

set -uo pipefail

MODE="${1:-diff}"
TARGET="${2:-HEAD}"

REPORT_TMP="$(mktemp -t security-scan.XXXXXX)"
trap 'rm -f "$REPORT_TMP"' EXIT

available() { command -v "$1" >/dev/null 2>&1; }

heading() { printf "\n## %s\n\n" "$1" >> "$REPORT_TMP"; }
note()    { printf "%s\n"      "$1" >> "$REPORT_TMP"; }

# ---- Determine scan scope ----
SCAN_PATHS=()
case "$MODE" in
  diff)
    if ! git rev-parse --git-dir >/dev/null 2>&1; then
      echo "Not in a git repo — use 'path <path>' mode instead." >&2
      exit 1
    fi
    # Files changed vs target (staged + unstaged + untracked tracked-by-add).
    while IFS= read -r f; do
      [ -n "$f" ] && [ -f "$f" ] && SCAN_PATHS+=("$f")
    done < <(git diff --name-only "$TARGET" 2>/dev/null; git diff --name-only --cached 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null)
    if [ "${#SCAN_PATHS[@]}" -eq 0 ]; then
      echo "No changed files vs $TARGET." >&2
      exit 0
    fi
    ;;
  path)
    if [ -z "${TARGET}" ] || [ ! -e "$TARGET" ]; then
      echo "Path '$TARGET' does not exist." >&2
      exit 1
    fi
    SCAN_PATHS=("$TARGET")
    ;;
  *)
    echo "Unknown mode: $MODE (use 'diff' or 'path')" >&2
    exit 1
    ;;
esac

# Deduplicate paths (bash 3.2-compatible).
UNIQ_PATHS=()
seen_list=" "
for p in "${SCAN_PATHS[@]}"; do
  case "$seen_list" in
    *" $p "*) continue ;;
  esac
  UNIQ_PATHS+=("$p")
  seen_list="$seen_list$p "
done
SCAN_PATHS=("${UNIQ_PATHS[@]}")

echo "# Security scan report" > "$REPORT_TMP"
note ""
note "**Mode**: \`$MODE${TARGET:+ $TARGET}\`"
note "**Files in scope**: ${#SCAN_PATHS[@]}"
TOOLS_AVAILABLE=()
for t in semgrep gitleaks trivy; do
  if available "$t"; then TOOLS_AVAILABLE+=("$t"); fi
done
note "**Scanners available**: ${TOOLS_AVAILABLE[*]:-none — install: brew install semgrep gitleaks aquasecurity/trivy/trivy}"

ANY_FINDING=0

# ---- semgrep ----
if available semgrep; then
  heading "semgrep findings"
  SEMGREP_OUT="$(mktemp -t semgrep.XXXXXX)"
  if semgrep --config=auto --quiet --timeout=60 --metrics=off --error \
       --json -o "$SEMGREP_OUT" "${SCAN_PATHS[@]}" >/dev/null 2>&1; then
    note "_No findings._"
  fi
  if [ -s "$SEMGREP_OUT" ]; then
    COUNT=$(python3 -c "import json,sys; d=json.load(open('$SEMGREP_OUT')); print(len(d.get('results',[])))" 2>/dev/null || echo 0)
    if [ "$COUNT" -gt 0 ]; then
      ANY_FINDING=1
      python3 - "$SEMGREP_OUT" >> "$REPORT_TMP" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
buckets = {}
for r in d.get("results", []):
    sev = (r.get("extra", {}).get("severity") or "WARNING").upper()
    buckets.setdefault(sev, []).append(r)
for sev in ("ERROR","WARNING","INFO"):
    items = buckets.get(sev, [])
    if not items: continue
    print(f"\n### {sev} ({len(items)})\n")
    for r in items:
        path  = r.get("path","?")
        line  = r.get("start",{}).get("line","?")
        rule  = r.get("check_id","?")
        msg   = (r.get("extra",{}).get("message") or "").strip().splitlines()[0]
        meta  = r.get("extra",{}).get("metadata",{})
        cwe   = ", ".join(meta.get("cwe", []) or [])
        owasp = ", ".join(meta.get("owasp", []) or [])
        extras = []
        if cwe: extras.append(f"CWE: {cwe}")
        if owasp: extras.append(f"OWASP: {owasp}")
        es = f" _({'; '.join(extras)})_" if extras else ""
        print(f"- **`{path}:{line}`** [{rule}] — {msg}{es}")
PY
    else
      note "_No findings._"
    fi
  fi
  rm -f "$SEMGREP_OUT"
else
  heading "semgrep"
  note "_skipped — not installed._"
fi

# ---- gitleaks ----
if available gitleaks; then
  heading "gitleaks findings (secrets)"
  GITLEAKS_AGG="$(mktemp -t gitleaks-agg.XXXXXX).json"
  echo "[]" > "$GITLEAKS_AGG"
  for p in "${SCAN_PATHS[@]}"; do
    if [ -e "$p" ]; then
      GLR="$(mktemp -t gitleaks-r.XXXXXX).json"
      gitleaks detect --no-git --no-banner \
        --report-format json --report-path "$GLR" \
        --source "$p" >/dev/null 2>&1 || true
      if [ -s "$GLR" ]; then
        python3 -c "
import json,sys
agg=json.load(open('$GITLEAKS_AGG'))
try: new=json.load(open('$GLR'))
except Exception: new=[]
agg.extend(new)
json.dump(agg, open('$GITLEAKS_AGG','w'))
" 2>/dev/null || true
      fi
      rm -f "$GLR"
    fi
  done
  python3 - "$GITLEAKS_AGG" >> "$REPORT_TMP" <<'PY'
import json, sys
try:
    total = json.load(open(sys.argv[1]))
except Exception:
    total = []
if not total:
    print("_No secrets found._"); sys.exit(0)
print(f"\n**{len(total)} potential secret(s) — treat all as CRITICAL until verified false positive.**\n")
for r in total:
    f = r.get("File","?"); ln = r.get("StartLine","?")
    rule = r.get("RuleID","secret")
    desc = r.get("Description","")
    match = (r.get("Match") or "")[:80].replace("\n"," ")
    print(f"- **`{f}:{ln}`** [{rule}] {desc} — match: `{match}`")
PY
  if [ -s "$GITLEAKS_AGG" ]; then
    COUNT=$(python3 -c "import json; print(len(json.load(open('$GITLEAKS_AGG'))))" 2>/dev/null || echo 0)
    [ "$COUNT" -gt 0 ] && ANY_FINDING=1
  fi
  rm -f "$GITLEAKS_AGG"
else
  heading "gitleaks"
  note "_skipped — not installed._"
fi

# ---- trivy (filesystem scan for deps + IaC) ----
if available trivy; then
  heading "trivy findings (deps + IaC + secrets)"
  TRIVY_OUT="$(mktemp -t trivy.XXXXXX)"
  TRIVY_TARGET="."
  if [ "$MODE" = "path" ] && [ -e "$TARGET" ]; then TRIVY_TARGET="$TARGET"; fi
  if trivy fs --quiet --severity HIGH,CRITICAL --scanners vuln,secret,misconfig \
       --format json --output "$TRIVY_OUT" "$TRIVY_TARGET" 2>/dev/null; then
    if [ -s "$TRIVY_OUT" ]; then
      COUNT=$(python3 -c "import json; d=json.load(open('$TRIVY_OUT')); n=0
for r in d.get('Results',[]):
  n+=len(r.get('Vulnerabilities') or [])+len(r.get('Secrets') or [])+len(r.get('Misconfigurations') or [])
print(n)" 2>/dev/null || echo 0)
      if [ "$COUNT" -gt 0 ]; then
        ANY_FINDING=1
        python3 - "$TRIVY_OUT" >> "$REPORT_TMP" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
for r in d.get("Results", []):
    target = r.get("Target","?")
    vulns = r.get("Vulnerabilities") or []
    secrets = r.get("Secrets") or []
    misc = r.get("Misconfigurations") or []
    if not (vulns or secrets or misc): continue
    print(f"\n### {target}\n")
    for v in vulns:
        sev = v.get("Severity","?")
        pkg = v.get("PkgName","?")
        ver = v.get("InstalledVersion","?")
        fix = v.get("FixedVersion","(none)")
        cve = v.get("VulnerabilityID","?")
        title = (v.get("Title") or "").strip().splitlines()[0]
        print(f"- **{sev}** `{pkg}@{ver}` → fix: `{fix}` — [{cve}] {title}")
    for s in secrets:
        print(f"- **SECRET** {s.get('RuleID','?')} at line {s.get('StartLine','?')}")
    for m in misc:
        sev = m.get("Severity","?")
        title = m.get("Title","")
        print(f"- **{sev}** misconfig {m.get('ID','?')} — {title}")
PY
      else
        note "_No high/critical findings._"
      fi
    else
      note "_No findings._"
    fi
  else
    note "_trivy errored — skipping._"
  fi
  rm -f "$TRIVY_OUT"
else
  heading "trivy"
  note "_skipped — not installed._"
fi

# ---- Done ----
echo "" >> "$REPORT_TMP"
if [ "$ANY_FINDING" -eq 0 ]; then
  echo "## Verdict" >> "$REPORT_TMP"
  echo "" >> "$REPORT_TMP"
  echo "No findings from available scanners. Proceed with LLM-based review per the security skill methodology — scanners do not catch business-logic flaws, missing auth checks, or LLM-app sins (prompt injection, excessive agency)." >> "$REPORT_TMP"
fi

cat "$REPORT_TMP"
