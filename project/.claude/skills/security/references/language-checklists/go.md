# Go security checklist

Sinks (where to look for the dangerous operation), sources (where attacker input enters), and AI-specific patterns.

---

## Sources (untrusted input)

- `r.URL.Query().Get(...)`, `r.URL.Path`, `r.PathValue(...)` (Go 1.22+)
- `r.Form`, `r.PostForm`, `r.MultipartForm` (after `ParseForm`/`ParseMultipartForm`)
- `r.Header.Get(...)`, `r.Cookie(...)`
- `json.NewDecoder(r.Body).Decode(&v)` — and `v` shape determines what's trusted
- gRPC request fields
- Kafka/NATS/RabbitMQ message bodies
- File contents from user-supplied paths

## Sinks — flag immediately

| Sink | Vuln | Mitigation |
|---|---|---|
| `exec.Command("sh", "-c", userCmd)`, `exec.Command(userCmd, ...)` | CWE-78 OS command | Pass binary + arg list separately: `exec.Command("git", "clone", "--", userArg)`. Never via shell. |
| `db.Query(fmt.Sprintf("SELECT ... %s", x))` or `db.Query("SELECT ... " + x)` | CWE-89 SQLi | `db.Query("SELECT ... WHERE id = $1", x)` with placeholders. |
| `db.QueryRow("... " + name)` for table/column name | flag | Allowlist of valid identifiers. |
| `template/text` (`text/template`) used for HTML output | CWE-79 XSS | `html/template` always for HTML; `text/template` for text/JSON only. |
| `template.HTML(userInput)` cast | CWE-79 | Don't cast user input to `template.HTML`. |
| `http.Get(userURL)`, `http.Client{}.Get(userURL)` (server-side) | CWE-918 SSRF | Custom `http.Client` with `Transport` that validates `DialContext` target IP against private ranges. |
| `http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}}` | CWE-295 | Remove. Pin certs if needed. |
| `os.Open(userPath)`, `ioutil.ReadFile(userPath)`, `os.OpenFile(userPath, ...)` | CWE-22 path traversal | `filepath.Clean` + check `strings.HasPrefix(absPath, baseAbs+string(os.PathSeparator))`. |
| `archive/zip`, `archive/tar` `Open` + iterate without name validation | CWE-22 zip slip | Validate each header `Name` doesn't escape extraction dir. |
| `encoding/gob.Decoder.Decode(&v)` from network | CWE-502 | Gob is not safe for untrusted data; use protobuf with strict schema. |
| `crypto/md5`, `crypto/sha1` for security | CWE-327 | `crypto/sha256`+; `golang.org/x/crypto/argon2` or `bcrypt` for passwords. |
| `math/rand` for tokens/IDs/nonces (especially `rand.New(rand.NewSource(time.Now().UnixNano()))`) | CWE-330 | `crypto/rand.Read(buf)`. |
| `crypto/aes` with `cipher.NewCBCEncrypter` and predictable IV | CWE-329 | AES-GCM with `crypto/rand` nonce. |
| `jwt.Parse(tokenString, keyfn)` without `Method` check (`alg=none`, HS↔RS confusion) | CWE-347 | Verify `token.Method.(*jwt.SigningMethodRSA)` (or HMAC) explicitly. |
| `regexp.MustCompile(userPattern).MatchString(input)` | ReDoS-ish (Go RE2 is safe from catastrophic backtracking, but flag if pattern is huge / used in hot path) | Limit pattern length; use timeout via context. |
| `http.ServeFile(w, r, userPath)` | CWE-22 | `http.ServeFileFS` with restricted FS, or validate path. |
| `unsafe.Pointer` + arithmetic on user offsets | memory safety | Don't. |

## Net/http specific

- `http.HandleFunc("/", handler)` without method check (`GET`/`POST`) — allows wrong methods to mutate state.
- Missing `Server` timeouts (`ReadTimeout`, `WriteTimeout`, `IdleTimeout`) — slowloris.
- `cors.AllowAll()` (rs/cors) or `Access-Control-Allow-Origin: *` with credentials.
- Cookies set without `Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode`.
- `r.ParseMultipartForm(maxMemory)` with high `maxMemory` and no upstream size limit — memory DoS.
- Trusting `X-Forwarded-For` for client IP without checking the proxy was real.
- `httputil.ReverseProxy` rewriting Host without validating target — SSRF / open proxy.

## Concurrency-specific

- Map writes from multiple goroutines without `sync.Mutex` — data race that can corrupt state in security-relevant ways (e.g., session map).
- `time.After` in select inside a hot loop — goroutine leak (timer not GC'd until fires).
- Context not propagated through DB/HTTP calls — prevents cancellation, enables resource exhaustion.

## Generics / reflection specific

- `reflect.Value.Set` from unchecked input.
- Decoding JSON into `interface{}` then type-asserting without checks.

## Common AI mistakes

- LLM uses `fmt.Sprintf` to build SQL queries.
- LLM uses `math/rand.Int63()` for session tokens.
- LLM ignores `error` returns from `crypto/rand.Read` or `db.Exec`.
- LLM writes `password == storedHash` (timing attack); use `subtle.ConstantTimeCompare`.
- LLM uses `bcrypt.DefaultCost` which is fine, but then reduces it because "tests are slow" — flag the lower cost.
- LLM forgets `defer rows.Close()` on `db.Query` — connection exhaustion in error paths (not security per se but DoS).
- LLM uses `os.Setenv` at runtime to "configure" something — race condition + global mutable state.
- LLM writes a custom JWT lib instead of using `golang-jwt/jwt`.
- LLM uses `net/url.Parse` and trusts the result without checking `Scheme` (could be `file://`, `gopher://`, etc.).
- LLM trusts `Filename` from `multipart.FileHeader` directly when constructing storage path — path traversal via filename.
