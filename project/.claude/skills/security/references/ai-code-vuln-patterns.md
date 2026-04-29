# Vulnerability patterns specific to AI-generated code

Empirical evidence (cite when relevant in reviews):

- **Veracode 2025** — AI-generated code has **2.74× more vulnerabilities** than human-written; **45% of samples** introduce OWASP Top 10 vulns; **86% failure rate** on XSS (CWE-80).
- **ACM TOSEM Feb 2025** (Copilot empirical study, 733 snippets) — **29.5% of Python** and **24.2% of JavaScript** snippets are vulnerable across 43 CWEs.
- **arXiv 2510.26103** (Oct 2025, 7,703 files, 4 tools) — **4,241 CWE instances across 77 types**.

Use this doc as a checklist for any LLM-authored code change.

---

## Top recurring patterns

### 1. CWE-330 — Insufficient randomness for security purposes

LLMs default to `Math.random()` / `random.random()` / `rand.Intn()` even when generating tokens, IDs, nonces, password reset codes, salts, session IDs.

| Wrong | Right |
|---|---|
| `Math.random().toString(36).slice(2)` | `crypto.randomBytes(32).toString('hex')` |
| `random.choice(string.ascii_letters)` for a token | `secrets.token_urlsafe(32)` |
| Go `math/rand.Int()` for an ID | `crypto/rand.Read()` |

**Always flag** if a non-CSPRNG is used for: tokens, password resets, session IDs, nonces, IVs, salts, JWT secrets, email verification codes, share links, CSRF tokens.

### 2. CWE-89 — SQL injection via string concatenation

LLMs love f-strings/template literals over parameter binding.

| Wrong | Right |
|---|---|
| `f"SELECT * FROM users WHERE id={user_id}"` | `"SELECT * FROM users WHERE id = ?", (user_id,)` |
| `` `SELECT * WHERE name='${name}'` `` | `db.query('SELECT * WHERE name = $1', [name])` |
| `"INSERT INTO logs VALUES (" + msg + ")"` | parameterized statement |

Also flag dynamic table/column names — those can't be parameterized; require allowlist.

### 3. CWE-79 — Unescaped HTML rendering

LLMs reach for `dangerouslySetInnerHTML` (React), `v-html` (Vue), `{@html}` (Svelte), `innerHTML` directly.

**Rule**: any of these directives on user-controlled content = HIGH unless the source is statically sanitized (DOMPurify with strict config, or markdown-it with `html: false`).

### 4. CWE-94 — Code injection (`eval`, `exec`, `Function`)

LLMs use these for "dynamic" features:
- "Calculator" features → `eval(user_input)`
- "Custom rules" features → `new Function(rule_string)`
- "Macros" → `exec(user_code)`

**Rule**: there is essentially no legitimate reason to use `eval`/`exec` on user input in modern code. Always CRITICAL.

### 5. CWE-502 — Insecure deserialization

| Wrong | Right |
|---|---|
| `pickle.loads(request.body)` | JSON + schema validation; never pickle untrusted data |
| `yaml.load(f)` (PyYAML default in old versions, dangerous) | `yaml.safe_load(f)` |
| `Marshal.load(data)` (Ruby) | JSON |
| Java `ObjectInputStream.readObject()` | use Jackson with allowlisted polymorphism |

### 6. CWE-22 — Path traversal

LLMs build file paths with `os.path.join(base, user_input)` thinking that's safe — `os.path.join("/safe/", "/etc/passwd")` returns `/etc/passwd`.

```python
# Wrong
open(os.path.join(UPLOAD_DIR, filename))

# Right
target = (Path(UPLOAD_DIR) / filename).resolve()
if not target.is_relative_to(Path(UPLOAD_DIR).resolve()):
    raise ValueError("path traversal")
open(target)
```

Same for `fs.readFile(path.join(base, req.params.name))` in Node.

### 7. CWE-798 / CWE-259 — Hardcoded secrets

LLMs sometimes write `API_KEY = "sk-..."` as a "placeholder" that becomes real. Or include test creds in committed `.env.example` that are real prod creds.

### 8. CWE-918 — SSRF

Agent/integration code: `fetch(req.body.url)`, `requests.get(req.body.url)`, image proxy, link previewer.

Mitigation: scheme allowlist (`http`/`https` only), DNS-resolve and reject if IP in private ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, IPv6 ULA, link-local), reject metadata endpoints (169.254.169.254, 100.100.100.200 for Alibaba, fd00:ec2::254 for IPv6).

### 9. CWE-942 — Permissive CORS

LLMs default to `app.use(cors())` (allows all origins) or reflect `Origin` back. Combined with credentials, this is account takeover.

```js
// Wrong
app.use(cors({origin: true, credentials: true}))  // reflects any origin

// Right
const ALLOWED = new Set(["https://app.example.com"])
app.use(cors({
  origin: (o, cb) => cb(null, ALLOWED.has(o)),
  credentials: true,
}))
```

### 10. CWE-1321 — Prototype pollution

LLMs write deep-merge utilities without `__proto__` / `constructor` / `prototype` key filtering. Lodash `_.merge` with user input is the classic vector. Use `_.mergeWith` with a customizer or switch to `Object.assign({}, ...)` + explicit field copy.

### 11. CWE-327 / CWE-329 — Weak cryptography

- MD5/SHA1 for security (collisions). SHA-256+ for hashing; argon2id/scrypt/bcrypt for passwords.
- ECB mode (deterministic). Use AES-GCM.
- Hardcoded IV / null IV. IV must be random per encryption.
- `verify=False` / `rejectUnauthorized: false` on TLS clients.
- Old TLS (`SSLv3`, `TLSv1.0`, `TLSv1.1`).

### 12. CWE-352 — CSRF

LLMs often forget CSRF on state-changing endpoints when the auth is cookie-based. SameSite=Lax cookies mitigate but only against cross-site, not subdomain attacks.

### 13. CWE-200 — Information exposure

- Returning the entire user object including `password_hash`, `mfa_secret`, `email_verified_token`.
- Logging full request including `Authorization` header.
- Stack traces in API responses.

### 14. CWE-307 — Brute-force without limits

Login, password-reset, OTP-verify endpoints without rate limit or lockout.

### 15. LLM-app specific — Prompt injection sinks

When reviewing LLM/agent code:
- Untrusted text concatenated into the prompt without delimiters
- Tool call decisions from free-text model output instead of structured JSON
- Tool args passed unchecked from model to high-privilege actions (file write, shell, db mutation)
- System prompt containing secrets or auth rules
- Agent loops without depth caps

See `references/owasp-llm-top-10.md` for full coverage.

---

## Detection priorities

When triaging mixed AI/human code with limited time, scan in this order (highest exploit value first):

1. **Hardcoded secrets** (gitleaks output) — instant pivot for attacker
2. **eval / exec / pickle on user input** — RCE
3. **String-concat SQL with user input** — data exfiltration
4. **Missing auth on state-changing endpoints** — privilege escalation
5. **`Math.random()` for tokens** — predictable session/reset
6. **SSRF in agent/integration code** — cloud metadata pivot
7. **Prototype pollution / deserialization** — RCE in modern stacks
8. **dangerouslySetInnerHTML / v-html on user content** — XSS
9. **Path traversal** — read arbitrary files
10. **Permissive CORS + credentials** — account takeover
