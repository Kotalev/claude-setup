#!/usr/bin/env python3
"""
PostToolUse hook — runs available security scanners on edited files.

Behavior (option A — skip silently if scanners missing):
- Detects semgrep/gitleaks via `command -v`. Skips any that are not installed.
- Runs only on text source files matching known extensions.
- On clean output (or no scanners available + no critical patterns) → silent exit 0.
- On findings → emits JSON `additionalContext` with the report and a directive
  to invoke the `security` skill for deeper LLM-based triage.
- On CRITICAL findings (live-pattern secrets, eval/exec on input, raw SQL
  string-concat with input) → emits `decision: "block"` to halt the loop.

Hook input (stdin, JSON): { tool_name, tool_input: { file_path, ... }, ... }
Hook output (stdout, JSON): { hookSpecificOutput | decision }
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

OUTPUT_CHAR_CAP = 9500  # Claude Code caps hook stdout at 10k chars.

CODE_EXTENSIONS = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".py", ".pyi",
    ".go",
    ".rb",
    ".java", ".kt", ".scala",
    ".php",
    ".cs",
    ".rs",
    ".c", ".h", ".cc", ".cpp", ".hpp",
    ".sh", ".bash", ".zsh",
    ".sql",
    ".yml", ".yaml", ".toml", ".json",
    ".tf", ".hcl",
    ".dockerfile",
}

# Critical semgrep rule substrings — block the loop if matched at ERROR severity.
CRITICAL_RULE_PATTERNS = (
    "sql-injection", "sqli", "tainted-sql",
    "eval", "exec-use", "code-injection",
    "command-injection", "os-command",
    "deserialization", "pickle",
    "hardcoded-credential", "hardcoded-secret",
    "ssrf",
)


def read_hook_input() -> dict:
    try:
        return json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        return {}


def emit_silent() -> None:
    sys.exit(0)


def emit_context(report: str) -> None:
    payload = {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": report[:OUTPUT_CHAR_CAP],
        }
    }
    print(json.dumps(payload))
    sys.exit(0)


def emit_block(reason: str) -> None:
    payload = {
        "decision": "block",
        "reason": reason[:OUTPUT_CHAR_CAP],
    }
    print(json.dumps(payload))
    sys.exit(0)


def have(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def is_text_file(path: Path) -> bool:
    if path.suffix.lower() in CODE_EXTENSIONS:
        return True
    if path.name.lower() in {"dockerfile", "makefile"}:
        return True
    try:
        with path.open("rb") as f:
            chunk = f.read(2048)
        if b"\x00" in chunk:
            return False
        return True
    except OSError:
        return False


def run_semgrep(file_path: Path) -> list[dict]:
    if not have("semgrep"):
        return []
    try:
        result = subprocess.run(
            [
                "semgrep",
                "--config=auto",
                "--json",
                "--quiet",
                "--timeout=20",
                "--metrics=off",
                str(file_path),
            ],
            capture_output=True,
            text=True,
            timeout=25,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return []
    if not result.stdout:
        return []
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []
    findings = []
    for r in data.get("results", []):
        findings.append({
            "tool": "semgrep",
            "rule": r.get("check_id", "unknown"),
            "severity": (r.get("extra", {}).get("severity") or "WARNING").upper(),
            "line": r.get("start", {}).get("line", 0),
            "message": (r.get("extra", {}).get("message") or "").strip(),
            "cwe": ", ".join(r.get("extra", {}).get("metadata", {}).get("cwe", []) or []),
            "owasp": ", ".join(r.get("extra", {}).get("metadata", {}).get("owasp", []) or []),
        })
    return findings


def run_gitleaks(file_path: Path) -> list[dict]:
    if not have("gitleaks"):
        return []
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
        report_path = tf.name
    try:
        try:
            subprocess.run(
                [
                    "gitleaks",
                    "detect",
                    "--no-git",
                    "--no-banner",
                    "--report-format", "json",
                    "--report-path", report_path,
                    "--source", str(file_path),
                ],
                capture_output=True,
                text=True,
                timeout=15,
            )
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return []
        try:
            with open(report_path) as f:
                content = f.read().strip()
        except OSError:
            return []
        if not content or content == "[]":
            return []
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            return []
    finally:
        try:
            os.unlink(report_path)
        except OSError:
            pass
    findings = []
    for r in data:
        findings.append({
            "tool": "gitleaks",
            "rule": r.get("RuleID", "secret"),
            "severity": "CRITICAL",
            "line": r.get("StartLine", 0),
            "message": r.get("Description", "Detected secret"),
            "match": (r.get("Match") or "")[:80],
        })
    return findings


def is_critical(finding: dict) -> bool:
    if finding["tool"] == "gitleaks":
        return True
    if finding["tool"] == "semgrep" and finding.get("severity") == "ERROR":
        rule_lower = finding.get("rule", "").lower()
        return any(p in rule_lower for p in CRITICAL_RULE_PATTERNS)
    return False


def format_report(file_path: Path, findings: list[dict], scanners_run: list[str]) -> str:
    lines = [
        f"# Security scan: `{file_path.name}`",
        "",
        f"Scanners run: {', '.join(scanners_run) if scanners_run else '(none installed — install semgrep + gitleaks for SAST coverage)'}",
        f"Findings: **{len(findings)}**",
        "",
    ]
    by_sev = {}
    for f in findings:
        by_sev.setdefault(f.get("severity", "INFO"), []).append(f)
    for sev in ("CRITICAL", "ERROR", "WARNING", "INFO"):
        bucket = by_sev.get(sev, [])
        if not bucket:
            continue
        lines.append(f"## {sev} ({len(bucket)})")
        for f in bucket:
            loc = f"line {f['line']}" if f.get("line") else "?"
            extras = []
            if f.get("cwe"):
                extras.append(f"CWE: {f['cwe']}")
            if f.get("owasp"):
                extras.append(f"OWASP: {f['owasp']}")
            extras_str = f" ({'; '.join(extras)})" if extras else ""
            lines.append(f"- **[{f['tool']}/{f['rule']}]** {loc} — {f['message']}{extras_str}")
        lines.append("")
    lines.extend([
        "---",
        "**Action required**: Invoke the `security` skill to triage these findings using the high-confidence methodology (confidence ≥8/10, exclude theoretical/DoS). Do not proceed with further implementation until critical findings are resolved or explicitly accepted.",
    ])
    return "\n".join(lines)


def main() -> None:
    payload = read_hook_input()
    tool_input = payload.get("tool_input", {}) or {}
    file_path_str = tool_input.get("file_path") or tool_input.get("notebook_path")
    if not file_path_str:
        emit_silent()

    file_path = Path(file_path_str)
    if not file_path.exists() or not file_path.is_file():
        emit_silent()
    if not is_text_file(file_path):
        emit_silent()

    cwd = Path(os.getcwd()).resolve()
    try:
        file_path.resolve().relative_to(cwd)
    except ValueError:
        # File outside project — skip.
        emit_silent()

    scanners_run = []
    findings: list[dict] = []
    if have("semgrep"):
        scanners_run.append("semgrep")
        findings.extend(run_semgrep(file_path))
    if have("gitleaks"):
        scanners_run.append("gitleaks")
        findings.extend(run_gitleaks(file_path))

    if not findings:
        emit_silent()

    critical = [f for f in findings if is_critical(f)]
    report = format_report(file_path, findings, scanners_run)

    if critical:
        block_reason = (
            f"BLOCKED: {len(critical)} critical security finding(s) in {file_path.name}. "
            "Fix or explicitly accept before continuing.\n\n" + report
        )
        emit_block(block_reason)

    emit_context(report)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Never break the user's workflow — degrade silently on internal errors.
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": f"[security-scan hook internal error: {type(e).__name__}: {e}]",
            }
        }))
        sys.exit(0)
