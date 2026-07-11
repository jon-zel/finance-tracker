"""
Travel Expenses Tracker — FastAPI backend.

All frontend/backend communication is JSON over relative /api/* URLs, so
hosting this on the web is a matter of deployment, not a rewrite (see
deployment-auth-spec.md). Auth (session cookies, login/logout, the startup
USERS check) lives here; per-user file access lives in excel_io.py and
app/routes/*; session mechanics live in app/auth.py.
"""
import sys
import time
from pathlib import Path

from fastapi import Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

import config
import excel_io
import rate_tracking
from app import auth
from app.routes import expenses, trips

# Refuse to start with an open/empty user list (spec §4.4, AC#3). Checked at
# import time — before uvicorn ever binds a socket — not just at a startup
# event, so there's no window where the process is "up" but unusable.
if not config.USERS:
    print(
        "USERS is empty in config.py. Run scripts\\hash_password.py to create "
        "your first user, add it to USERS, then start the service.",
        file=sys.stderr,
    )
    raise SystemExit(1)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"

app = FastAPI(title="Travel Expenses Tracker")

# Trust X-Forwarded-Proto/-For only from a reverse proxy on the same machine
# (spec §10) — needed so request.url.scheme reflects https when behind
# Cloudflare Tunnel / Caddy.
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["127.0.0.1"])

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

app.include_router(trips.router)
app.include_router(expenses.router)


@app.on_event("startup")
def on_startup() -> None:
    import os

    os.makedirs(config.TRIPS_DIR, exist_ok=True)
    rate_tracking.sync_on_startup()


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


# ---- Auth pages (spec §3, §5) ----

LOGIN_ERROR_GENERIC = "Email or password is incorrect."
LOGIN_ERROR_RATE_LIMITED = "Too many attempts. Please wait a few minutes and try again."


def _render_login(request: Request, error: str | None, status_code: int = 200) -> HTMLResponse:
    return templates.TemplateResponse(
        request, "login.html", {"error": error}, status_code=status_code
    )


@app.get("/login", include_in_schema=False, response_class=HTMLResponse)
def login_page(request: Request):
    if auth.get_session_email(request) is not None:
        return RedirectResponse(url="/", status_code=303)
    return _render_login(request, error=None)


@app.post("/login", include_in_schema=False)
def login_submit(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
):
    client_ip = request.client.host if request.client else "unknown"

    if not auth.login_rate_limiter.is_allowed(client_ip):
        return _render_login(request, error=LOGIN_ERROR_RATE_LIMITED, status_code=429)

    started = time.monotonic()
    auth.login_rate_limiter.record_attempt(client_ip)

    if not auth.is_valid_email(email) or not auth.is_valid_password(password):
        auth.pad_failed_login(started)
        return _render_login(request, error=LOGIN_ERROR_GENERIC, status_code=400)

    normalized_email = email.lower()
    stored_hash = config.USERS.get(normalized_email)

    if stored_hash is None or not auth.verify_password(password, stored_hash):
        auth.pad_failed_login(started)
        return _render_login(request, error=LOGIN_ERROR_GENERIC, status_code=401)

    excel_io.ensure_user_folder(auth.email_to_folder(normalized_email))

    redirect = RedirectResponse(url="/", status_code=303)
    auth.set_session_cookie(redirect, normalized_email)
    return redirect


@app.get("/logout", include_in_schema=False)
@app.post("/logout", include_in_schema=False)
def logout():
    redirect = RedirectResponse(url="/login", status_code=303)
    auth.clear_session_cookie(redirect)
    return redirect


# ---- Protected app root (spec §3.1) ----


@app.get("/", include_in_schema=False)
def index(request: Request):
    if auth.get_session_email(request) is None:
        return RedirectResponse(url="/login", status_code=303)
    return HTMLResponse((STATIC_DIR / "index.html").read_text(encoding="utf-8"))


@app.get("/api/me")
def get_me(user: str = Depends(auth.require_auth)):
    return {"email": user}


@app.get("/api/config")
def get_config(user: str = Depends(auth.require_auth)):
    return {
        "base_currency": config.BASE_CURRENCY,
        "base_currency_symbol": config.BASE_CURRENCY_SYMBOL,
        "exchange_rates": config.EXCHANGE_RATES,
        "categories": config.CATEGORIES,
        "monitored_categories": config.MONITORED_CATEGORIES,
        "default_time_range": config.DEFAULT_TIME_RANGE,
    }


@app.get("/api/rates/history")
def get_rate_history(user: str = Depends(auth.require_auth)):
    return {"history": rate_tracking.load_history()}


# Public static assets last, mounted under /static/ (spec §3.2) so it never
# shadows "/" or "/api/*" above.
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
