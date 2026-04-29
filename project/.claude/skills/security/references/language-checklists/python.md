# Python security checklist

Sinks (where to look for the dangerous operation), sources (where attacker input enters), and AI-specific patterns.

---

## Sources (untrusted input)

- Flask: `request.args`, `request.form`, `request.json`, `request.cookies`, `request.headers`, `request.files`
- FastAPI: path params, query params, request body (validate with Pydantic — flag any handler taking `dict` or `Request` directly without schema)
- Django: `request.GET`, `request.POST`, `request.body`, `request.FILES`, `request.META`
- Async: `await request.body()`, `await request.form()`, `await request.json()`
- Celery task args (came from somewhere — trace upstream)
- File contents read from a user-uploaded path
- `os.environ` defaults / fallbacks

## Sinks — flag immediately

| Sink | Vuln | Mitigation |
|---|---|---|
| `eval(x)`, `exec(x)`, `compile(x)` | CWE-94 RCE | Don't. There is no safe way with untrusted input. |
| `pickle.load(...)`, `pickle.loads(...)`, `cPickle`, `dill.loads` | CWE-502 | JSON + Pydantic schema. Pickle only for code-trusted data. |
| `yaml.load(f)` (without `Loader=SafeLoader`) | CWE-502 | `yaml.safe_load(f)` always. |
| `marshal.loads(x)` | CWE-502 | JSON. |
| `subprocess.run(cmd, shell=True)`, `subprocess.call(... shell=True)`, `os.system(...)`, `os.popen(...)` | CWE-78 OS command | `subprocess.run([...], shell=False)` with list args. |
| `subprocess.run(['git', userArg])` without `--` separator before user args | flag injection | Always `['cmd', '--', user_arg]`. |
| `f"SELECT ... WHERE id={x}"`, `cur.execute("... " + x)` | CWE-89 SQLi | `cur.execute("... WHERE id = %s", (x,))` or use SQLAlchemy ORM. |
| Raw SQLAlchemy `text(f"... {x} ...")` | CWE-89 | `text("... :x ...").bindparams(x=x)` |
| Django raw `Model.objects.raw(f"... {x}")` | CWE-89 | Use ORM filters or `raw("...", [x])` with placeholders. |
| `Template(user_input).render(...)` (Jinja2) | SSTI | Never render user-controlled templates. If you must, sandboxed environment + `autoescape=True`. |
| `Environment(autoescape=False)` | CWE-79 | `autoescape=True` always for HTML contexts. |
| `Markup(user_html)` (Flask Markup) | CWE-79 XSS | Bleach with strict allowlist. |
| `mark_safe(x)` (Django) | CWE-79 | Same. |
| `requests.get(user_url)`, `httpx.get(user_url)`, `urllib.request.urlopen(user_url)` | CWE-918 SSRF | URL allowlist, DNS resolve, reject private IPs. |
| `requests.get(url, verify=False)`, `httpx.get(url, verify=False)` | CWE-295 | Remove. Use system CA bundle or pinned cert. |
| `open(user_path)`, `Path(user_path).read_text()`, `pathlib` joining user input | CWE-22 path traversal | `(BASE / name).resolve().is_relative_to(BASE.resolve())` |
| `tarfile.extractall()`, `zipfile.extractall()` | CWE-22 zip slip | Validate each `getmembers()` name doesn't contain `..` or absolute path. Or use `tarfile.data_filter` (Python 3.12+). |
| `xml.etree.ElementTree.parse(...)` on user XML | XXE in some Python versions | Use `defusedxml`. |
| `lxml.etree.parse(..., parser=lxml.etree.XMLParser())` default | XXE | `XMLParser(resolve_entities=False, no_network=True, dtd_validation=False)` or `defusedxml`. |
| `hashlib.md5`, `hashlib.sha1` for security | CWE-327 | `hashlib.sha256+`; passwords → `argon2`/`bcrypt`/`scrypt`. |
| `random.random()`, `random.choice`, `random.randint` for tokens/IDs/nonces | CWE-330 | `secrets.token_urlsafe(32)`, `secrets.choice`, `secrets.randbits`. |
| `Crypto.Cipher.AES.new(key, AES.MODE_ECB)` | CWE-327 | AES-GCM with random nonce. |
| `jwt.decode(token, options={"verify_signature": False})` | CWE-347 | Verify signature with explicit `algorithms=['RS256']`. |
| `Flask(... debug=True)` in prod, `DEBUG = True` in Django prod | CWE-489 | Env-gated; never True in prod. |
| `request.args.get('x', cast=int)` then unchecked into integer arithmetic that might overflow into `range()` | DoS | Bound the value. |

## Django-specific

- `csrf_exempt` decorator — flag and demand justification.
- Querysets used with `.extra(where=[user_input])` — SQLi.
- `safe` template filter on user content — XSS.
- `User.objects.create_user` without explicit `is_staff=False, is_superuser=False`.
- `LOGIN_REDIRECT_URL` / `next` parameter not validated against allowlist.
- `ALLOWED_HOSTS = ['*']` in non-test settings.

## FastAPI-specific

- Endpoints typed `dict` or `Any` for request body — bypass validation.
- `Depends()` security scheme not actually checked downstream.
- `BackgroundTasks` with user-supplied callable.

## Flask-specific

- `app.config['SECRET_KEY']` hardcoded or `os.urandom` per-process (invalidates sessions on restart).
- `send_file(user_path)` — path traversal.
- `render_template_string(user_input)` — SSTI.

## Async / asyncio specific

- `asyncio.create_subprocess_shell(cmd)` — same as `shell=True`. Use `create_subprocess_exec`.
- `asyncio.wait_for` missing on a network call → connection exhaustion.

## Common AI mistakes

- LLM writes `os.path.join(BASE_DIR, user_filename)` thinking it's safe.
- LLM uses `re.match(user_pattern, input)` enabling ReDoS.
- LLM defaults to `pickle` for "fast serialization" with no thought to attack surface.
- LLM uses `yaml.load` because tutorials are old.
- LLM writes `bcrypt.hashpw(pw, bcrypt.gensalt(rounds=4))` (rounds=4 is too low — use 12+).
- LLM reaches for `pycryptodome` and uses ECB or static IV.
- LLM uses `subprocess.run(cmd, shell=True)` because it "needs pipes" — use `subprocess.run(['sh', '-c', '...'])` only with hardcoded commands.
- LLM puts secrets in `__init__.py` "for convenience".
- LLM uses `input()` in a script that's deployed as a service (just pointer that the LLM didn't think about deployment).
- LLM defaults SQLAlchemy `text()` with f-string interpolation instead of `bindparams`.
