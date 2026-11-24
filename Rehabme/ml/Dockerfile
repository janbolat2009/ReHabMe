# Internal ML inference service. Model artefacts are mounted read-only at /app/artifacts (never baked into the image).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd -r -u 10001 ml
COPY rehabme_ml ./rehabme_ml
COPY service.py .
USER ml
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8001/health')" || exit 1
CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
