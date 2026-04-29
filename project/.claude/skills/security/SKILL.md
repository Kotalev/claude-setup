---
name: security
description: Comprehensive security review of code changes — OWASP Top 10 (2025), AI-generated code vulnerability patterns, secrets detection, and triage of findings from semgrep/gitleaks. Use after any code implementation (new feature, bug fix, refactor); when reviewing security-sensitive changes (auth, crypto, SQL, network, file I/O, deserialization, IPC); when the security-scan hook injects findings; or when the user asks for a security audit. Filters HIGH-CONFIDENCE findings only — excludes theoretical, DoS, rate-limit, framework-protected XSS, and env-var-as-trusted issues.
---

# Security Review Skill

Performs a high-confidence security review of recently changed code. Combines static analysis (semgrep/gitleaks output) with LLM-based data-flow tracing against OWASP Top 10 (2025), the OWASP LLM Top 10, and known AI-generated code vulnerability patterns.

## When to invoke

- The `security-scan` PostToolUse hook injected findings via `additionalContext` and instructed you to triage them.
- A new feature, bug fix, or refactor touched **any** of: authentication, authorization, crypto, sessions, SQL/NoSQL queries, file I/O, network calls, deserialization (pickle, YAML, XML), template rendering, regex on user input, command execution, IPC, secret handling, dependency manifests.
- The user explicitly asked for a security audit, vulnerability check, or penetration-style review.

If the user merely added a non-security-sensitive helper (string formatting, math, UI styling) and the hook reported zero findings — skip this skill.

## Workflow

```
1. Determine scope:
   - Hook-triggered? Use the file(s) named in the injected report.
   - User-requested? Use `git diff HEAD~1...HEAD` (or staged diff) to find changed files.
2. Run scripts/run-scanners.sh on the changed scope (broader than per-file hook).
3. For each language touched, read the matching reference:
   references/language-checklists/{javascript,python,go}.md
4. For findings AND for code paths the scanners cannot reason about (auth flow,
   business logic, multi-step data flow), apply the triage methodology below.
5. Cross-reference each surviving finding against:
   - references/owasp-top-10-2025.md
   - references/owasp-llm-top-10.md (if the code involves LLM calls/agents)
   - references/ai-code-vuln-patterns.md
6. Emit the report in the schema below.
```

## Triage methodology — HIGH-CONFIDENCE only

A finding goes in the report only if **all** of the following are true:

1. **Reachable**: There is a concrete code path from an attacker-controlled source (HTTP body/query/header, RPC arg, file, env var sourced at runtime, message-queue payload) to the dangerous sink. Theoretical reachability is not enough.
2. **Exploitable as-is**: The exploit does not require an attacker to also compromise something else (the code is the weak link, not the assumption).
3. **Confidence ≥ 8/10**: You can describe the exploit in concrete steps with named inputs, not "an attacker could theoretically...".

### Exclusion list (DO NOT report)

| Excluded | Why |
|---|---|
| DoS via large input / regex catastrophic backtracking | Usually rate-limited at the edge; report only if the regex is on an unauthenticated public endpoint with no upstream limits. |
| Memory/CPU exhaustion in batch jobs | Operational concern, not exploitable security. |
| Missing rate limiting | Infrastructure layer — not a code-review finding. |
| Verbose error messages in dev paths | Only flag if user-visible in production with stack/SQL/secret leakage. |
| Open redirect to same-origin paths | Not exploitable absent additional XSS sink. |
| XSS in framework-escaped contexts (`{value}` in React/Vue/Svelte without `dangerouslySetInnerHTML` / `v-html` / `{@html}`) | Framework escapes by default. |
| Env-var-sourced "secrets" in code (`process.env.X`) | Trusted boundary; flag only if the env var contains a default value or is logged. |
| Hardcoded credentials in test fixtures / `*test*` / `*spec*` files | Test data is not a secret. |
| TODO/FIXME comments mentioning security | Comments are not vulnerabilities. |
| Missing CSRF on `GET` / read-only endpoints | CSRF requires state change. |
| Markdown/HTML in user content rendered after sanitization (DOMPurify, bleach) | Already mitigated. |
| `Math.random()` for non-cryptographic purposes (UI keys, jitter) | Only flag for tokens, IDs, nonces, salts. |
| Type confusion that's caught by static type checker | Already a compile-time error. |
| Legacy weak crypto in compatibility code paths gated behind `if (legacy)` | Document, don't block. |
| SQL string concat where the concatenated value is a hardcoded constant | Not user-controlled. |
| Missing input validation when downstream layer validates | Defense-in-depth, not a real finding. |

If you find yourself writing "an attacker could potentially…" or "in theory…" — STOP. Either prove the exploit or drop the finding.

## Output format

For each surviving finding:

```
### [SEVERITY] Title
**File**: `path/to/file.ext:LINE`
**CWE**: CWE-NNN ([name])
**OWASP**: A0X — [category]
**Confidence**: N/10

**Exploit scenario** (concrete, named inputs):
1. Attacker sends `POST /api/x` with body `{"y": "...payload..."}`
2. Controller passes `y` unchecked to `db.query("... " + y)`
3. Result: arbitrary SQL execution → exfiltrate `users` table

**Remediation** (specific code change):
```diff
- db.query("SELECT * FROM users WHERE id = " + id)
+ db.query("SELECT * FROM users WHERE id = ?", [id])
```

**Why this matters**: [1-2 sentences of educational context]
```

Severity scale: **CRITICAL** (RCE, auth bypass, data exfiltration with verified path), **HIGH** (privilege escalation, sensitive disclosure), **MEDIUM** (information leak with limits, weak crypto in non-critical path), **LOW** (defense-in-depth gap with real-world exploit).

## Final summary

End the review with:

```
## Verdict
- Critical: N
- High: N
- Medium: N
- Low: N

**Recommendation**: [BLOCK MERGE | NEEDS FIXES | ACCEPT WITH NOTES | CLEAN]
```

`BLOCK MERGE` if any CRITICAL. `NEEDS FIXES` if any HIGH. Otherwise the dev decides.

## Resources in this skill

- `scripts/run-scanners.sh` — runs semgrep + gitleaks on a path or git diff. Skips silently if a tool is not installed.
- `references/owasp-top-10-2025.md` — OWASP Top 10 (2025) categories with what each means at code level.
- `references/owasp-llm-top-10.md` — OWASP Top 10 for LLM Applications (2025). Read when the code involves LLM API calls, agents, prompts, embeddings, or vector stores.
- `references/ai-code-vuln-patterns.md` — empirically-observed vulnerability patterns specific to AI-generated code (Veracode 2025, ACM TOSEM 2025, arXiv 2510.26103). Read this for any LLM-authored code.
- `references/language-checklists/javascript.md` — JS/TS-specific sinks, sources, and common AI mistakes.
- `references/language-checklists/python.md` — Python-specific sinks (pickle, YAML, eval, subprocess, jinja autoescape).
- `references/language-checklists/go.md` — Go-specific (template/html, sql.DB, exec.Command, crypto/rand vs math/rand).

## Coexistence with `elite-code-reviewer`

This skill is **security-only and deeper**. The `elite-code-reviewer` agent does broad multi-aspect review (correctness, perf, arch, security at a surface level). This skill is invoked when security depth is needed — either by the hook on actual scanner findings or by the user. The two are complementary, not redundant. Do not run both for the same change unless explicitly asked.
