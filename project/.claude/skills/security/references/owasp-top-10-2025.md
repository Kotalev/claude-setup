# OWASP Top 10:2025 — code-review lens

Source: https://owasp.org/Top10/2025/

Use this to map findings to the canonical category. Each entry: what it means at code level, the smell, and the fix archetype.

---

## A01 — Broken Access Control (now subsumes SSRF)

**Code smell**: Missing/inconsistent authorization checks on routes; relying on UI to hide actions; IDOR (passing object IDs in URL without ownership check); SSRF via `fetch(user_url)`, `requests.get(user_url)`, server-side image proxies, webhook callbacks, link previews.
**Fix archetype**: Centralized authz middleware; ownership predicates in queries (`WHERE owner_id = current_user`); URL allowlists for SSRF (scheme + host + IP-after-DNS-resolution against private ranges).
**Examples to flag**: `@app.route('/admin/...')` without auth decorator; `db.find({_id: req.params.id})` without owner clause; `httpClient.get(req.body.url)`.

## A02 — Security Misconfiguration

**Code smell**: Default credentials; permissive CORS (`Access-Control-Allow-Origin: *` with credentials, or reflected `Origin`); debug/stack traces enabled in prod paths; cookies without `HttpOnly`/`Secure`/`SameSite`; framework dev mode in prod build; verbose `Server:` headers; directory listing.
**Fix archetype**: Explicit allowlist of origins; secure cookie defaults; environment-aware error pages.

## A03 — Software Supply Chain Failures (was "Vulnerable Components", expanded)

**Code smell**: Unpinned dependencies (`*`, `^`); typosquatting (`reqeusts`, `expresss`, `lodahs`); install scripts running curl-pipe-bash; missing lockfile; pulling images from unverified registries; missing SBOM.
**Fix archetype**: Lockfiles committed; renovate/dependabot; `npm audit signatures` / `pip install --require-hashes`; pin Docker by digest.

## A04 — Cryptographic Failures

**Code smell**: MD5/SHA1 for security; ECB mode; static/null IV; rolling your own crypto; storing passwords with fast hash (use bcrypt/scrypt/argon2id); plaintext PII at rest; unencrypted comms; `Math.random()` for tokens; weak TLS config (`SSLv3`, `TLSv1.0`); missing certificate verification (`verify=False`, `rejectUnauthorized: false`).
**Fix archetype**: argon2id for passwords; AES-GCM with random IV; `secrets.token_urlsafe()` / `crypto.randomBytes()` for tokens; TLS 1.2+; explicit cert verification.

## A05 — Injection

Sub-types and red flags:

| Type | Red flag |
|---|---|
| **SQLi** | Any string concat / f-string / template literal building queries: `f"SELECT * FROM users WHERE id={id}"`, `\`...${var}...\`` |
| **NoSQLi** | `db.users.find(req.body)`, operator injection (`{"$ne": null}`) |
| **OS command** | `exec`, `system`, `subprocess.call` with `shell=True`, `child_process.exec` |
| **LDAP** | `(&(uid=${input}))` |
| **XPath** | `//user[name='${input}']` |
| **XXE** | XML parsers without `disable_external_entities` (libxml, lxml default in old versions, xmlsec) |
| **Server-side template** | `render_template_string(user_input)`, Jinja `Environment(autoescape=False)` |
| **Header injection** | `\r\n` in user-controlled response headers / email subjects |
| **Log injection** | `\n` in user-controlled log messages enabling forged log lines |
| **Prompt injection** | User input concatenated into LLM system/user message without delimiters/sanitization |

**Fix archetype**: Parameterized queries / prepared statements; ORM with bound params; `subprocess.run([...], shell=False)`; LDAP escaping; XML parser with entity expansion off; template autoescape on; CRLF stripping; structured logging; LLM input wrapped in tagged delimiters + output schema validation.

## A06 — Insecure Design

**Code smell**: Missing threat model; security as afterthought; "trust the client" patterns (price/role/permission sent from frontend); business logic flaws (negative quantities, race conditions in checkout/transfer, TOCTOU in file ops).
**Fix archetype**: Server-side validation of every business invariant; idempotency keys; mutex/transactions for state changes; explicit threat model in `SECURITY.md`.

## A07 — Authentication Failures (renamed from "Identification and Authentication")

**Code smell**: Custom session tokens; session fixation (no rotation on login); weak password policy; missing brute-force protection; missing MFA on sensitive ops; predictable reset tokens; `remember-me` cookies that don't expire; long-lived JWTs without rotation; sending JWTs in URL params.
**Fix archetype**: Battle-tested auth library; rotate session ID on login; account lockout/captcha after N failures; MFA on irreversible actions; signed reset tokens with short TTL; refresh-token rotation.

## A08 — Software and Data Integrity Failures

**Code smell**: Insecure deserialization (`pickle.loads`, `yaml.load` without `SafeLoader`, `Marshal.load`, `ObjectInputStream`, `unserialize`); auto-update without signature verification; CI/CD pulling unsigned artifacts; missing SRI on `<script src>`; client-side state trusted on server (e.g., decrypting and trusting a JWT without verifying signature).
**Fix archetype**: `yaml.safe_load`; `pickle` only for trusted data; signed artifacts; SRI hashes; verify JWT signature with the right algorithm (`alg=none` rejection, no algorithm confusion HS↔RS).

## A09 — Security Logging and Monitoring Failures

**Code smell**: Auth failures not logged; logs missing user/request ID; logs containing passwords/tokens/PII; no centralized log shipping; no alerting on anomalies.
**Fix archetype**: Audit log for auth + privileged actions; redact secrets (allowlist log fields, not denylist); structured logs with correlation IDs; alerts on `5xx` spikes, repeated `401`s.

## A10 — Mishandling of Exceptional Conditions (NEW in 2025)

**Code smell**: Bare `except:` swallowing all errors; catching auth/security errors and continuing; failing open instead of failing closed; using error message contents as control flow; uncaught exceptions in security-critical paths leading to bypass.
**Fix archetype**: Catch specific exceptions; fail closed (deny by default); never use error string matching for security decisions; ensure every security check has a matching `else: deny`.

---

## Quick mapping table for findings

| Pattern in code | OWASP category |
|---|---|
| String-concat SQL | A05 |
| `pickle.loads(req.body)` | A08 |
| `Math.random()` for tokens | A04 |
| `bcrypt(password, rounds=4)` | A04 |
| `app.use(cors())` (no allowlist) | A02 |
| `fetch(req.query.url)` | A01 (SSRF) |
| `db.User.findById(req.params.id)` w/o owner check | A01 (IDOR) |
| `jwt.decode(token, verify=False)` | A07/A08 |
| `child_process.exec("convert " + filename)` | A05 |
| `dangerouslySetInnerHTML={{__html: userBio}}` | A05 (XSS) |
| `yaml.load(f)` without SafeLoader | A08 |
| `axios.get(url, {httpsAgent: new https.Agent({rejectUnauthorized: false})})` | A04 |
| Hardcoded API key in source | A02 + supply chain risk |
| `verify=False` in `requests.get` | A04 |
| `app.get('/admin/users', handler)` no auth | A01 |
| `eval(req.body.expr)` | A05 (code injection) |
