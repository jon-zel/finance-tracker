"""
Prints a bcrypt hash for a password you type (input hidden, no echo).

Usage:
    .venv\\Scripts\\python.exe scripts\\hash_password.py

Paste the printed hash into USERS in config.py, keyed by the user's email,
then restart the service (restart.bat) — see deployment-auth-spec.md §4.2.
"""
import getpass
import re
import sys

import bcrypt

# Mirrors app/auth.py's is_valid_password — duplicated (not imported) so this
# script has no dependency on config.py/SESSION_SECRET already existing; it
# needs to run standalone during first-time bootstrap, before those exist.
PASSWORD_MIN_LEN = 8
PASSWORD_MAX_LEN = 128
_PASSWORD_BAD_CHARS = re.compile(r"[\r\n\t\x00]")


def is_valid_password(password: str) -> bool:
    if not (PASSWORD_MIN_LEN <= len(password) <= PASSWORD_MAX_LEN):
        return False
    return not _PASSWORD_BAD_CHARS.search(password)


def main() -> None:
    password = getpass.getpass("New password: ")
    if not is_valid_password(password):
        print(
            f"Password must be {PASSWORD_MIN_LEN}-{PASSWORD_MAX_LEN} characters "
            "and contain no tabs/newlines.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Passwords did not match.", file=sys.stderr)
        raise SystemExit(1)

    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    print()
    print("Paste this into USERS in config.py:")
    print(f'    "your-email@example.com": "{hashed}",')


if __name__ == "__main__":
    main()
