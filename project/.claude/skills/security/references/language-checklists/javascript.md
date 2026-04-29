# JavaScript / TypeScript security checklist

Sinks (where to look for the dangerous operation), sources (where attacker input enters), and AI-specific patterns.

---

## Sources (untrusted input)

- `req.body`, `req.query`, `req.params`, `req.headers`, `req.cookies` (Express/Koa/Fastify)
- `request.json()`, `request.formData()`, `request.headers.get()` (Web API/Hono/Next.js Route Handlers)
- `searchParams` from `URL`/`useSearchParams`
- `params`/`searchParams` props in Next.js page/layout/route
- WebSocket `message.data`
- Worker `postMessage` data from another origin
- File uploads (`req.file`, `formData.get('file')`) — content AND filename
- `process.env` values that themselves came from runtime config (less common, but treat default values as suspect)

## Sinks — flag immediately when source flows in

| Sink | Vuln | Mitigation |
|---|---|---|
| `eval(x)`, `new Function(x)`, `setTimeout(x, ...)` with string `x`, `vm.runInNewContext(x)` | CWE-94 RCE | Don't. If you must — sandboxed VM with memory/CPU limits, no `require`. |
| `child_process.exec(cmd)`, `child_process.execSync(cmd)` | CWE-78 OS command | Use `execFile`/`spawn` with array args. Never `shell: true` with user input. |
| `child_process.spawn(prog, args, { shell: true })` | CWE-78 | Drop `shell: true`. |
| `db.query(\`SELECT * WHERE id=${x}\`)` template literal SQL | CWE-89 SQLi | Parameterized: `db.query('SELECT * WHERE id = $1', [x])` |
| `mongo.find(req.body)` | NoSQLi (operator injection) | Validate body against schema (zod/yup) before passing. |
| `dangerouslySetInnerHTML={{__html: x}}` (React) | CWE-79 XSS | DOMPurify with strict config; or render as text. |
| `v-html="x"` (Vue), `{@html x}` (Svelte) | CWE-79 | Same. |
| `el.innerHTML = x`, `el.outerHTML = x`, `document.write(x)` | CWE-79 | Use `el.textContent` or DOM methods. |
| `fetch(req.body.url)`, `axios.get(userUrl)` server-side | CWE-918 SSRF | URL allowlist + DNS resolve + reject private IPs. |
| `fs.readFile(path.join(BASE, name))` | CWE-22 path traversal | Resolve, then verify `resolved.startsWith(BASE)` or use `path.relative` check. |
| `res.redirect(req.query.next)` | CWE-601 open redirect | Validate against allowlist of safe paths. |
| `JSON.parse(x)` with reviver that touches `__proto__` | CWE-1321 prototype pollution | Use schema validation (zod) on parsed result. |
| `_.merge({}, target, userInput)` | CWE-1321 | `_.mergeWith` with key filter or schema-validated input. |
| `Object.assign(target, userObj)` where `target` is a config | CWE-915 mass assignment | Pick allowlisted keys. |
| `jwt.verify(token, secret, { algorithms: undefined })` or `jwt.decode` without `verify` | CWE-347 | Pin algorithms `['RS256']`; use `verify`, not `decode`. |
| `crypto.createHash('md5'/'sha1')` for security | CWE-327 | SHA-256+; argon2id for passwords. |
| `Math.random()` for token/id/nonce | CWE-330 | `crypto.randomBytes(32).toString('hex')`. |
| `https.Agent({ rejectUnauthorized: false })`, `axios({ httpsAgent: ... })` | CWE-295 | Remove. If self-signed cert needed: pin specific cert/CA. |
| `cors()` no args, or `cors({ origin: true, credentials: true })` | CWE-942 | Function-form origin with explicit allowlist. |
| `cookie.set(..., { secure: false })` or no `httpOnly`/`sameSite` for auth cookies | CWE-1004 | `httpOnly: true, secure: true, sameSite: 'lax' or 'strict'`. |
| `serialize-javascript` / `JSON.stringify` of state into HTML without `<` escape | XSS | Use libraries that escape `</script>` and unicode separators. |

## TypeScript-specific

- `as any` chains that bypass schema checks at trust boundaries.
- `// @ts-expect-error` on user-input handling code.
- `Record<string, any>` in API request types — usually means missing validation.
- `Buffer.from(b64, 'base64')` then unchecked `JSON.parse(buf.toString())` from cookies/URLs (auth bypass risk if also signed elsewhere).

## React/Next.js specific

- Server Actions accepting unchecked `formData` — must validate every field server-side; client validation is decorative.
- `cookies()` reads being trusted as auth without re-verifying signature.
- `notFound()` / `redirect()` used for "auth", which is just UX — must also gate the data fetch.
- Edge runtime functions calling `process.env` for secrets that aren't actually present at edge.
- `next.config.js` rewrites/redirects with user-controlled segments.
- Route Handlers without explicit method check (`POST` route accepting `GET`).

## Node.js specific

- `require(userInput)` / `import(userInput)` — RCE.
- `vm.runInThisContext` — basically `eval`.
- `fs.createReadStream(userPath)` without sandbox check.
- `child_process.execFile('git', ['clone', userUrl])` — `userUrl` starting with `--upload-pack=...` injects flag (always pass `--` separator before user args).
- `process.env` mutated at runtime as a "config update" — global mutable state risk.

## Common AI mistakes

- LLM writes a "sanitizer" with a denylist (`<script>`-strip) instead of a parser-based escape. Always reject hand-rolled HTML sanitizers.
- LLM uses `encodeURIComponent` and thinks that prevents SQL injection. It doesn't.
- LLM checks `if (req.user)` for auth then proceeds without re-verifying ownership of the requested resource.
- LLM uses `new RegExp(userPattern)` enabling ReDoS catastrophic backtracking.
- LLM reaches for `crypto-js` (deprecated, slow, weak defaults). Prefer Node `crypto` or Web Crypto.
