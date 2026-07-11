# Travel Expenses Tracker

A small deployed web app for tracking expenses during a trip — multi-user (owner + a
few family members), each with their own private trips, running as a background
Windows service on your always-on PC. See `deployment-auth-spec.md` for the full
design.

## First-time setup — `deploy.bat`

Double-click `deploy.bat`. It will:

1. Ask for admin rights (needed to install a Windows service).
2. Create a clean virtual environment (`.venv`) and install pinned dependencies.
3. Generate a session secret (`config/.session_secret`).
4. If `USERS` in `config.py` is empty, walk you through creating your first login —
   it runs `scripts\hash_password.py`, prints a line to paste into `config.py`, and
   pauses so you can do that before continuing.
5. Download NSSM (the service manager) and install/start the `TravelExpensesApp`
   Windows service, set to auto-start on boot and auto-restart on crash.
6. Print the local URL, your LAN URL, and the logs folder.

It's safe to run again any time — every step is idempotent.

Open **http://localhost:8000** (or the LAN URL from another device on your Wi-Fi) —
it redirects to a login page.

## Adding another user (2–3 family members)

1. Run `.venv\Scripts\python.exe scripts\hash_password.py`. Type the new person's
   password when prompted (it won't be echoed to the screen).
2. It prints a line like:
   ```
   "your-email@example.com": "$2b$12$....",
   ```
3. Open `config.py`, add that line inside the `USERS` dict with **their real email**
   as the key, save.
4. Run `restart.bat` so the service picks up the change.

Each user gets their own private folder under `trips/` (created automatically the
first time they log in) — nobody can see, list, or open another user's trips.

## Removing a user

Delete their line from `USERS` in `config.py`, then run `restart.bat`. Their session
is invalidated immediately.

**Their trip files are *not* deleted.** `trips/<their_folder>/` is left on disk —
if you want their data gone too, that's a manual step: delete that folder yourself.

## Updating the code later

After copying in new code (or pulling changes), run `update.bat`. It stops the
service, reinstalls dependencies if `requirements.txt` changed, and starts it back
up — no manual steps.

If you only changed `config.py` (e.g. added/removed a user, changed categories or
exchange rates), you don't need `update.bat` — just run `restart.bat`.

## Viewing service logs

```
type logs\service.err.log
```

Or watch it live in PowerShell:

```
Get-Content logs\service.err.log -Wait -Tail 50
```

`logs\service.out.log` / `logs\service.err.log` are stdout/stderr from the running
server. NSSM rotates them once they pass 10 MB (renamed with a timestamp) — it
doesn't automatically delete old rotated files, so clear out `logs\` occasionally if
disk space matters to you.

## Uninstalling the service

Run `uninstall.bat`. It stops and removes the Windows service only — your trip
data, `config.py`, and logs are left exactly where they are.

## Exposing this to the internet

The app itself is ready (binds to `0.0.0.0`, trusts a local reverse proxy's
`X-Forwarded-*` headers, and toggles the session cookie's `Secure` flag via the
`deploy.bat` HTTPS prompt) — but actually putting it on the internet (router
config, DNS, a reverse proxy like Cloudflare Tunnel or Caddy for HTTPS) is a
one-time manual setup outside this codebase. See the manual guide referenced in
`deployment-auth-spec.md` §10.

## Your trip data

Unchanged from before: each trip is one `.xlsx` file with `Date`, `Amount`,
`Category`, `Notes` columns — now stored per-user under
`trips/<sanitized-email>/<trip name>.xlsx`. The app only ever appends new rows; it
never edits or deletes existing ones.

**Existing trips from before this revision:** three files (`Portugal 2027.xlsx`,
`TH - PH - KAZ 2026.xlsx`, `Thailand 04.2026.xlsx`) are still sitting directly in
`trips\`, from before per-user folders existed. After you log in for the first
time, your personal folder appears at `trips\<your_folder>\` — move those three
files into it (cut and paste in File Explorer, or `move` in PowerShell) so they
show up in the app again. They won't appear anywhere on their own.

## Configuration

Everything editable lives in `config.py` at the project root:

- `USERS` — email → bcrypt password hash. See "Adding another user" above.
- `BASE_CURRENCY` / `BASE_CURRENCY_SYMBOL` — the currency your trip files store
  amounts in.
- `EXCHANGE_RATES` — conversion rates for other currencies you spend in.
- `CATEGORIES` — the full category list shown in the Add Expense dropdown.
- `MONITORED_CATEGORIES` — the subset that gets its own gauge on the dashboard.

These (currencies, categories) are shared app-wide, not per-user — a deliberate
simplicity choice at this scale (deployment-auth-spec.md §2A.5).

Exchange rate changes are logged with a date in `config/rates_history.json`
(viewable from the "Exchange rate history" link in the app footer).
