# syntax=docker/dockerfile:1.7
# Backend container for the Kinetic decision engine.
#
# Build context is the repository root so the image can also pull in
# shared assets if we ever add them; the docker-compose service uses
# `context: .` and `dockerfile: backend/Dockerfile`.

FROM python:3.12-slim AS base

# Avoid Python writing .pyc files and buffering stdout/stderr.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies first so the layer caches across code-only changes.
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy only the application package. We `cd` into this directory at run
# time so `from .auth import ...` style relative imports resolve via the
# `app` namespace package, matching the local `uvicorn app.api:app`
# invocation pattern the project already uses.
COPY backend/app /app/app

# Run as a non-root user.
RUN groupadd --system kinetic && useradd --system --gid kinetic --home /home/kinetic --create-home kinetic \
    && chown -R kinetic:kinetic /app /home/kinetic
USER kinetic

EXPOSE 8000

CMD ["uvicorn", "app.api:app", "--host", "0.0.0.0", "--port", "8000"]
