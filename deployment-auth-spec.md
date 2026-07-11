# Travel Expenses Tracker — Deployment & Auth Specification (Revision 3.0)

## 0. Purpose

This spec turns the existing local-dev travel-expenses app into a **real deployed web
application** on the user's always-on home Windows PC. Scope:

1. Runs as a **background Windows service** that starts automatically at boot.
2. Uses a **clean isolated virtual environment** so its Python packages never collide with
   anything else on the machine.
3. Requires **email + password login** on every visit; credentials are stored in a config
   file (§4).
4. **Frontend validates** the login form inputs against a strict allow-list *before* the
   request is even sent — a first line of defense against injection-style payloads.
5. Provides a **one-click deploy** experience on Windows (one `.bat` file, run once), and
   a **one-click update** experience for future code updates.
6. Is **internet-ready** — the app itself is configured to be exposed to the internet. The
   actual internet-exposure steps (router/DNS/HTTPS) are handled outside this spec, in a
   separate manual guide, because they're one-time human actions on the router/DNS
   provider, not something the codebase does.

Assumptions locked from the earlier conversation:
- **Users:** the owner + 2–3 family members (~4 accounts total).
- **Data model:** **each user has their own private trips.** No sharing between users
  (§2A). A user only ever sees, reads, writes, or lists their own files.
- **Windows service:** yes — starts on boot, restarts on crash, no manual intervention.
- **Password rule:** minimum length 8 characters.

Non-goals of this revision:
- No password reset flow, no "forgot password". If a family member forgets, the owner
  edits `config.py` and restarts the service (§4.5).
- No 2FA.
- No cloud hosting. The app runs on the user's own hardware.
- No cross-user sharing of trips (a user can't grant another user access to their trips
  in-app). If two users want to look at the same trip today, the owner copies the file
  into both users' folders — see §2A.6.

---

## 2A. Per-user data isolation (⭐ core to this revision)

Each user has their **own private trips folder**, keyed by their email. A logged-in user
can only ever see, list, read, and write files in **their own folder**. There is no
"shared" area. Enforced end-to-end.

### 2A.1 Folder layout

Trip files live under a per-user subfolder of `TRIPS_DIR`:

```
trips/
├── owner_at_example_com/
│   ├── Greece 2026.xlsx
│   └── Japan 2025.xlsx
├── partner_at_example_com/
│   └── Girls Trip 2026.xlsx
└── kid_at_example_com/
    └── School Trip.xlsx
```

- Each user's folder name is the **sanitized email**: lowercase, then every character
  outside `[a-z0-9]` is replaced with `_`. E.g. `Owner@Example.COM` →
  `owner_example_com`. Store the sanitizer in `app/auth.py` as `email_to_folder(email)`
  and use it everywhere (server-side only — the folder name is never exposed in URLs).
- On login (§3), if the user's folder doesn't exist, the server **creates it** empty.
- On adding a user in `USERS` (§4.2), no manual folder step is needed — first login
  creates it.
- On removing a user (§4.3), the folder is **left in place** by default (user data is
  not silently deleted). Documented in the README as a manual cleanup step.

### 2A.2 API path change

The existing trip routes stay URL-compatible with the frontend but resolve to the
**logged-in user's** folder server-side:

- `GET  /api/trips`  → lists only files in `TRIPS_DIR/<current_user>/`.
- `POST /api/trips`  → creates the new file in `TRIPS_DIR/<current_user>/`.
- `GET  /api/trips/{name}/expenses` → reads
  `TRIPS_DIR/<current_user>/<name>.xlsx`.
- `POST /api/trips/{name}/expenses` → writes to that same path.

The frontend does not need to know about the folder — it uses the same URLs. This is
important: it means the client bundle has **no identifier tying it to any user**, and
switching users requires nothing more than logging in as another user.

### 2A.3 Path traversal defense (critical)

Every trip name coming from the frontend is untrusted input. The server MUST:

1. Reject any name containing `/`, `\`, `..`, ASCII control characters (< 0x20), or a
   trailing dot/space. Reject any name longer than 100 characters.
2. Build the file path only via `Path(TRIPS_DIR) / email_to_folder(user.email) / f"{name}.xlsx"`.
3. Resolve both the user's folder and the built path with `.resolve()`, and verify that
   `str(built_path).startswith(str(user_folder))` — if not, **reject with 400** and log
   the attempt.
4. Never accept a full path from the client, only a bare trip name.

This closes any "user A crafts a trip name of `../userB/Their Trip`" attack.

### 2A.4 Rendering the user in the UI

- The header shows the logged-in user's email (small, right-aligned, next to Log out).
- No cross-user hints anywhere: don't show the total number of users, don't autocomplete
  emails at login, don't hint at whether another user has trips.

### 2A.5 Rate history and shared config

- `EXCHANGE_RATES`, `CATEGORIES`, `MONITORED_CATEGORIES`, `BASE_CURRENCY`, and
  `rates_history.json` remain **application-wide** (not per-user). Rationale: these are
  the owner's configuration of the app, not user-generated data.
- If a family member wants different categories, the owner adjusts `config.py`. This is
  a deliberate simplicity choice for the ~4-user scale.

### 2A.6 Sharing a trip between users (manual)

Not an in-app feature. If the owner wants their partner to see a specific trip:
> Owner copies `trips/owner_..._com/Trip.xlsx` into `trips/partner_..._com/Trip.xlsx`.

Documented in the README. Each side then has an independent copy; edits don't sync.

---

## 1. What changes in the codebase vs. what stays

**Stays exactly as it is:**
- The entire existing feature set: trips, expenses, categories, monitored gauges, charts,
  currency conversion, migration script.
- The `.xlsx` schema and the Golden Rule (§2 of the travel-expenses spec).
- The visual language (the second, "fintech-style" overhaul).
- The FastAPI + vanilla-JS architecture.

**Changes (small, additive):**
- The `require_auth` stub becomes a **real** auth check backed by session cookies (§3).
- A `/login` page is added (§5).
- `config.py` gains a `USERS` dict (§4).
- Trip storage becomes **per-user**: all trip routes resolve to the logged-in user's own
  folder under `TRIPS_DIR` (§2A). Frontend URLs are unchanged.
- A Windows service wrapper is added (§6).
- A one-click deploy script `deploy.bat` is added (§7).

---

## 2. Environment isolation (clean venv)

The service must run in its own Python virtual environment so nothing collides with
whatever else the user has on the machine.

- The venv lives at `./.venv` at the project root.
- `deploy.bat` (§7) creates it on first run using `py -3.11 -m venv .venv`.
- All `pip install` commands run inside `.venv\Scripts\pip.exe` — never the system pip.
- `requirements.txt` at the project root pins **exact** versions (e.g. `fastapi==0.115.0`)
  so re-deploys are deterministic.
- The Windows service (§6) launches Python from `.venv\Scripts\python.exe` explicitly —
  never relies on `PATH`.

---

## 3. Authentication design

### 3.1 What the user sees

- Every request to `/` or any protected page: if not logged in → redirect to `/login`.
- `/login` shows a simple form: email, password, "Log in" button.
- On successful login → redirect to the app, set a session cookie, done.
- A small "Log out" button in the app header (top-right, in the fintech-style header row)
  clears the session cookie and redirects to `/login`.

### 3.2 How it works under the hood

- Sessions use **signed, HttpOnly, SameSite=Lax cookies**. Library: **`itsdangerous`** (a
  well-known small dependency, used by Flask internally) to sign a session id.
  - Cookie name: `session`.
  - Cookie contents: signed value of the user's email.
  - `HttpOnly` — JavaScript can't read it (blocks a big class of XSS attacks).
  - `SameSite=Lax` — protects against CSRF from other sites.
  - `Secure` — set to `True` when the app is served over HTTPS (see §10). Off in local dev.
  - Lifetime: 30 days rolling (extended on each authenticated request).
- Passwords in `config.py` are stored as **bcrypt hashes**, not plain text (§4.2). Even if
  a family member peeks at the file, they can't read anyone else's password. Library:
  **`bcrypt`**.
- **Rate limiting** on `/login`: no more than 5 attempts per IP per 5 minutes; further
  attempts get a 429 response with a friendly message. In-memory counter is fine at this
  scale.
- Login handler uses **constant-time comparison** for the bcrypt check (bcrypt's `checkpw`
  already does this — do not implement your own `==`).
- The existing `require_auth` FastAPI dependency, currently a no-op stub, becomes the real
  check: read the session cookie, verify the signature, resolve the email, attach the user
  to the request. If any step fails → redirect (browser routes) or 401 (API routes).
- All `/api/*` routes and the app root are protected. `/login`, `/logout`, and any static
  assets under `/static/` are public.

### 3.3 Session secret

- A random `SESSION_SECRET` string (≥ 32 bytes of urandom) is used to sign session cookies.
- `deploy.bat` generates it on first run and writes it into `./config/.session_secret` if
  the file doesn't exist. The value is loaded from that file at server startup.
- **Never** committed to source control. The file lives in `./config/` and `.gitignore`
  excludes it.
- If the file is ever deleted, all existing sessions are invalidated (every user must log
  in again). That's fine.

---

## 4. `config.py` — the credentials file

The user has explicitly asked for credentials in a config file. Rendered as:

```python
# config.py  (already exists; USERS is added)

USERS = {
    "owner@example.com":   "$2b$12$abcdef...hashed...",
    "partner@example.com": "$2b$12$abcdef...hashed...",
    "kid@example.com":     "$2b$12$abcdef...hashed...",
}
```

### 4.1 Format

- A plain Python dict at the top of `config.py`.
- Keys are emails (any RFC-shaped string; validation §5.2 is enough).
- Values are **bcrypt hashes**, not plaintext.

### 4.2 Adding a user (manual, deliberate)

Provide a small helper script at `scripts/hash_password.py`:

- Run: `.venv\Scripts\python.exe scripts\hash_password.py`
- It prompts for a password (input hidden, no echo).
- It prints the bcrypt hash to stdout.
- The user pastes that hash into `USERS` in `config.py`.
- Restart the service (`restart.bat`, §7.3) — done.

### 4.3 Removing a user

Delete the line from `USERS`, restart the service. Any active session for that user is
immediately invalidated on their next request (email not found → redirect to /login).

### 4.4 Bootstrap on first deploy

If `USERS` is empty on server startup, the server **does not start**. It logs a clear
message to the console:
> `USERS is empty in config.py. Run scripts\hash_password.py to create your first user, add it to USERS, then start the service.`

This prevents an accidentally-public open server.

### 4.5 "Forgot password" flow

There isn't one. The owner runs `hash_password.py`, replaces the hash in `config.py`,
restarts. Documented explicitly in the README.

---

## 5. Frontend login form + input validation

### 5.1 The page

- Route: `GET /login`. Returns a small, self-contained HTML page styled to match the app's
  fintech look and light/dark theme.
- Fields: email (`type="email"`, `required`, `autocomplete="username"`), password
  (`type="password"`, `required`, `autocomplete="current-password"`, `minlength="8"`).
- Submit button.
- On failure: friendly generic message: *"Email or password is incorrect."* — never
  "user does not exist" vs "wrong password" (that leaks whether an email is registered).

### 5.2 Frontend validation (before any request is sent)

**This is the "block malicious code" layer the user asked for.** Client-side validation
alone does not stop a determined attacker, but it does stop typos, accidents, and casual
injection attempts, and it makes the login flow cleaner. The **same rules are enforced
again server-side** in §5.3.

Validation rules applied to the inputs on `submit`:

- **Email:**
  - Length: 3–254 characters.
  - Matches a conservative regex:
    `/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/`.
  - Rejects any character outside `A-Z a-z 0-9 . _ % + - @`. In particular: **no
    whitespace, no quotes, no angle brackets, no semicolons, no backticks, no null bytes,
    no non-ASCII**. This kills the vast majority of payloads.
- **Password:**
  - Length: 8–128 characters.
  - Rejects `\r`, `\n`, `\t`, and null bytes.
  - Otherwise printable characters are allowed — no other character-class restrictions,
    so a password manager can generate strong passwords freely.
- Rejects if either field is empty after trimming.
- If validation fails: **do not submit the form**. Show a small inline message ("Please
  enter a valid email." / "Password must be at least 8 characters."). No request is sent.

### 5.3 Server-side validation (the actual security boundary)

Client validation is a UX filter, not a security boundary. The server runs the **exact
same rules** on the received form fields with a **Pydantic** model, using the same regex
and length bounds. Anything failing → 400 with a generic message. Anything passing is then
used only in:
- A bcrypt comparison against a value in `USERS`.
- A signed cookie value.

Neither of these is a shell command, a SQL query, or a file path. There is no code path in
which the email or password strings are interpreted, executed, or interpolated into any
shell/SQL/HTML/log line without escaping. This structural fact is what actually keeps the
login endpoint safe, alongside the input validation layers above.

### 5.4 Security-adjacent details worth stating explicitly

- The login form uses `method="POST"` and standard form encoding — no CSRF token is needed
  today because the app is same-origin, sessions are `SameSite=Lax`, and there are no
  cross-origin frontends. Add a CSRF token layer if that ever changes.
- The password field is `type="password"` and `autocomplete="current-password"` — password
  managers will offer to fill it.
- Login responses never echo the submitted email back into the HTML without escaping
  (mitigates reflected XSS via a crafted email).
- Successful login response sets the session cookie with `HttpOnly`, `SameSite=Lax`, and
  `Secure` (per §3.2, `Secure` on when behind HTTPS).
- Failed logins return in ~250 ms minimum (padded by `time.sleep`) to reduce timing
  signals about whether the email exists.

---

## 6. Windows service

The user has an always-on Windows PC that should run the app in the background,
auto-start on boot, and restart on crashes.

### 6.1 Chosen tool: **NSSM** (the Non-Sucking Service Manager)

- Free, tiny (a single `nssm.exe`), extremely widely used for exactly this use case:
  "make a normal EXE or Python process into a proper Windows service."
- Alternative considered and rejected: `pywin32` service wrapper — more finicky to
  install and debug. Windows built-in `sc.exe` — doesn't handle logging or restarts well
  for our shape. NSSM is the right pick here.
- NSSM is downloaded once by `deploy.bat` (§7) into `./tools/nssm.exe` if it isn't there
  already. Deterministic version pinned in the script.

### 6.2 Service definition

- Service name: `TravelExpensesApp`.
- Display name: "Travel Expenses App".
- Description: "Local FastAPI server for the family travel-expenses tracker."
- Executable: `<project>\.venv\Scripts\python.exe`.
- Arguments: `-m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1`.
- Working directory: the project root.
- **Startup type:** Automatic.
- **On failure:** restart after 5 seconds, indefinitely. NSSM's default restart behavior
  covers this.
- Logs:
  - stdout → `./logs/service.out.log`
  - stderr → `./logs/service.err.log`
  - Log rotation: NSSM's built-in rotation, 10 MB per file, keep 5 files.

### 6.3 `--host 0.0.0.0`

Important: binding to `0.0.0.0` (not `127.0.0.1`) means the server is reachable from
**other devices on the local network** — phones on the home Wi-Fi, another laptop, etc.
This is also the binding an internet gateway (router / Cloudflare Tunnel) needs.

If today the user wants to keep it strictly local for a while, change `0.0.0.0` to
`127.0.0.1`. This is documented in the README as a single-line change.

---

## 7. One-click deploy on Windows

Three `.bat` files at the project root, all runnable by double-click:

### 7.1 `deploy.bat` (first-time setup — run once)

Idempotent — safe to run multiple times.

Steps performed, in order:
1. **Check Python:** verify `py -3.11 --version` works; if not, print a link to
   https://www.python.org/downloads/ and abort. Do not attempt to install Python
   silently.
2. **Create venv:** if `./.venv/` doesn't exist, run `py -3.11 -m venv .venv`.
3. **Install deps:** run `.venv\Scripts\pip.exe install -r requirements.txt`.
4. **Prepare folders:** create `./trips/`, `./logs/`, `./config/` if missing.
5. **Generate session secret:** if `./config/.session_secret` doesn't exist, generate 32
   bytes of `secrets.token_urlsafe(32)` and write it there.
6. **Prompt to create first user** *only if* `USERS` in `config.py` is empty. Runs
   `scripts/hash_password.py` interactively and prints the exact line to paste into
   `config.py`. Pauses so the user can do it.
7. **Download NSSM** into `./tools/nssm.exe` if absent (pinned URL and pinned SHA-256
   verified after download).
8. **Install the Windows service** using `nssm install` and `nssm set` for each parameter
   in §6.2. If the service already exists, `nssm set` updates its parameters (idempotent).
9. **Start the service**: `nssm start TravelExpensesApp`.
10. Print a summary at the end: the local URL (`http://localhost:8000`), the LAN URL
    (e.g. `http://<local-IP>:8000` — script detects the primary IPv4 to display it), the
    logs folder path, and the commands to stop/restart the service.

Requires **admin rights** (services API needs it). The script re-launches itself elevated
via `powershell Start-Process -Verb RunAs` if it wasn't started as admin.

### 7.2 `update.bat` (routine code updates)

For when the code changes and you want to redeploy without a fresh install.
1. Stop the service: `nssm stop TravelExpensesApp`.
2. Re-install deps if `requirements.txt` changed:
   `.venv\Scripts\pip.exe install -r requirements.txt`.
3. Start the service: `nssm start TravelExpensesApp`.
4. Print status.

### 7.3 `restart.bat`

Just: `nssm restart TravelExpensesApp`. For when config was changed (e.g. `USERS`).

### 7.4 Bonus: `uninstall.bat`

Stops and removes the service (`nssm stop` then `nssm remove ... confirm`). Leaves data
(`./trips/`, `./config/`, `./logs/`) intact. Documented in README.

---

## 8. Project layout after this revision

```
travel-expenses/
├── .venv/                            # created by deploy.bat, gitignored
├── app/
│   ├── main.py                       # FastAPI app; login/logout routes; require_auth
│   ├── auth.py                       # session signing, bcrypt check, rate limiting
│   ├── routes/
│   │   ├── trips.py
│   │   └── expenses.py
│   ├── static/                       # css, js
│   └── templates/
│       └── login.html                # §5
├── config/
│   └── .session_secret               # generated on first deploy, gitignored
├── scripts/
│   ├── hash_password.py              # §4.2
│   └── migrate_categories.py         # (already exists)
├── trips/                            # per-user Excel files (§2A)
│   ├── owner_example_com/
│   │   └── Greece 2026.xlsx
│   └── partner_example_com/
│       └── Girls Trip 2026.xlsx
├── logs/                             # service stdout/stderr
├── tools/
│   └── nssm.exe                      # downloaded by deploy.bat
├── config.py                         # BASE_CURRENCY, USERS, EXCHANGE_RATES, etc.
├── requirements.txt                  # pinned deps
├── deploy.bat                        # §7.1
├── update.bat                        # §7.2
├── restart.bat                       # §7.3
├── uninstall.bat                     # §7.4
├── .gitignore                        # excludes .venv/, config/.session_secret, logs/
└── README.md                         # deploy steps, add-user, network-exposure guide
```

---

## 9. `requirements.txt` — new pinned dependencies

Additions to what the app already uses:

```
bcrypt==4.2.0
itsdangerous==2.2.0
python-multipart==0.0.12    # FastAPI needs this for form parsing on the login route
jinja2==3.1.4                # for rendering login.html via FastAPI templates
```

Everything already in the app (`fastapi`, `uvicorn`, `openpyxl`, etc.) stays the same,
with **exact pins**.

---

## 10. HTTPS & network exposure (leave hooks, do the config off-app)

The app itself doesn't terminate TLS. That's the right architectural call — anyone who
tries to run their own HTTPS stack inside the app ends up reinventing edge cases badly.

Instead, the app is prepared to sit behind a **reverse proxy** that terminates HTTPS and
forwards to `http://localhost:8000`. The recommended options are documented in the
manual guide (Cloudflare Tunnel is the easiest; Caddy is the classic self-hosted choice).
See "Manual Guide" section below this MD.

The code side of this preparation:
- The app already binds to `0.0.0.0` (§6.3) so a local reverse proxy can reach it.
- The app trusts `X-Forwarded-Proto` and `X-Forwarded-For` **only from `127.0.0.1`**
  (i.e., a reverse proxy running on the same machine), using FastAPI/Starlette's
  `ProxyHeadersMiddleware` with `trusted_hosts=["127.0.0.1"]`.
- The session cookie's `Secure` flag is toggled by an env var `APP_BEHIND_HTTPS=1`. When
  set, cookies get `Secure=True`. `deploy.bat` sets this via `nssm set ... AppEnvironmentExtra`
  based on a prompt asking the user "Are you deploying behind HTTPS (Cloudflare Tunnel /
  Caddy)? [y/N]".

---

## 11. Acceptance criteria

1. **Clean install:** on a fresh Windows PC with only Python 3.11 installed, double-clicking
   `deploy.bat` creates the venv, installs deps, generates the session secret, prompts for
   a first user, installs the service, and starts it. The URL `http://localhost:8000`
   redirects to `/login`.
2. **First user works:** logging in with the freshly-created credentials succeeds and lands
   on the app. Wrong password shows the generic error and does not distinguish between
   "wrong email" and "wrong password."
3. **Empty USERS refuses to start:** if `USERS` is empty in `config.py`, the service logs
   the "run hash_password" message and exits — the server does NOT come up in an open
   state.
4. **Password hashing:** the stored value for every user in `USERS` starts with `$2b$` (a
   bcrypt hash). No plaintext passwords appear anywhere in `config.py` or the logs.
5. **Frontend validation:** in the login form, entering an email with a space, a
   semicolon, or a quote, or a password shorter than 8 characters, prevents submit and
   shows an inline message. No POST request is sent (verifiable via DevTools → Network).
6. **Server-side validation:** bypassing the frontend by sending a raw POST with an invalid
   email (e.g. `foo bar@x.y` with a space) returns 400 without touching bcrypt or `USERS`.
7. **Rate limiting:** more than 5 failed login attempts from the same IP in 5 minutes
   return 429; a correct login afterwards is still blocked until the window resets.
8. **Session cookie flags:** the `session` cookie has `HttpOnly`, `SameSite=Lax`, and
   (when `APP_BEHIND_HTTPS=1`) `Secure` — verifiable in DevTools.
9. **Logout:** clicking Log out clears the cookie and any further request redirects to
   `/login`.
10. **Isolated venv:** the service's Python process runs from `.venv\Scripts\python.exe`
    (verifiable in Task Manager → command line). Uninstalling other Python packages
    globally does not affect the service.
11. **Service survives reboot:** rebooting the Windows PC and waiting ~30 seconds shows
    the service is `Running` in `services.msc` and the app is reachable.
12. **Service survives crash:** killing the Python process manually causes NSSM to restart
    it within ~5 seconds.
13. **LAN reachable:** from another device on the same Wi-Fi (e.g. a phone), opening
    `http://<PC-local-IP>:8000` shows the login page.
14. **Update flow:** running `update.bat` stops the service, updates deps if needed, and
    starts it again with no manual steps.
15. **HTTPS hook:** setting `APP_BEHIND_HTTPS=1` via the deploy prompt makes the session
    cookie carry `Secure`; leaving it unset makes it not carry `Secure`.
16. **Per-user isolation — happy path:** user A creates trip "Greece 2026"; it appears in
    `trips/<A_folder>/Greece 2026.xlsx`. User B logs in and `GET /api/trips` returns an
    empty list (or B's own trips only); user B does NOT see "Greece 2026".
17. **Per-user isolation — cross-read blocked:** user B tries `GET /api/trips/Greece 2026/expenses`
    while user A has that trip. Response is 404 (not 200, not 403 — 404 to avoid leaking
    existence). No row from A's file is ever returned to B under any request.
18. **Per-user isolation — cross-write blocked:** user B tries `POST /api/trips/Greece 2026/expenses`.
    Response is 404 and A's file on disk is byte-for-byte unchanged.
19. **Path traversal blocked:** any of the following trip names return 400 with no
    filesystem touch: `../foo`, `..\foo`, `foo/bar`, `foo\bar`, `foo\x00bar`, `foo.`,
    a 101-character name, an empty name. Attempt is logged.
20. **First-login folder creation:** a user in `USERS` who has never logged in has no
    folder on disk. On their first successful login, `trips/<their_folder>/` is created
    empty. Second login does not recreate or reset it.
21. **User removal preserves data:** removing a user from `USERS` and restarting invalidates
    their sessions but does NOT delete `trips/<their_folder>/`. Files remain on disk for
    manual cleanup.
