# AI service — production image (Cloud Run or any container host).
# Configuration comes from environment variables (see .env.example); the
# Vertex AI key is mounted at runtime, never baked into the image.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Runtime dependencies only: everything above the "# dev" line.
COPY requirements.txt ./
RUN sed '/^# dev/,$d' requirements.txt > requirements.prod.txt \
 && pip install -r requirements.prod.txt

COPY app/ ./app/

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000

# Cloud Run sets PORT; locally it defaults to 8000.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
