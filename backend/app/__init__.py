"""Kinetic backend package.

Loading `.env` here means *any* `from app.* import ...` statement gets
the file's variables in `os.environ` before the imported module reads
them. Real shell-exported env vars still win, so this is safe in CI/CD
and inside docker (where docker-compose's `env_file:` and `environment:`
have already populated `os.environ` long before we reach this line).
"""

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover - optional dep in some envs
    pass
