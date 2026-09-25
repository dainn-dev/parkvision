FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies layer — invalidated only when pyproject changes.
COPY pyproject.toml ./
RUN pip install --no-cache-dir --only-binary=:all: \
    "fastapi==0.141.1" "uvicorn[standard]==0.53.0" "sqlalchemy[asyncio]==2.1.0" \
    "asyncpg==0.31.0" "alembic==1.20.0" "pydantic==2.13.5" "pydantic-settings==2.15.0" \
    "pyjwt==2.15.0" "cryptography==50.0.1" "argon2-cffi==25.1.0" "pyotp==2.10.0" \
    "redis==5.3.1" "arq==0.28.0" "aiomqtt==2.5.1" "aioboto3==15.5.0" "aiosmtplib==5.1.3" \
    "python-multipart==0.0.32" "email-validator==2.3.0"

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY .env.example ./.env

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && python -m app.main"]
