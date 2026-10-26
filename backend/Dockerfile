# ==============================================================================
# Simple Legal AI - Backend Dockerfile
# Base Image: Official Python 3.11 slim image (Debian-based)
# ==============================================================================

FROM python:3.11-slim

# Set environment variables for Python runtime and application defaults
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    APP_ENV=production \
    LOG_LEVEL=INFO \
    DATABASE_URL=sqlite:////app/data/legal_timeline.db \
    UPLOAD_DIR=/app/uploads

# Install Linux system packages:
# - tesseract-ocr, tesseract-ocr-eng: OCR engine for scanned PDF judgment fallback
# - curl: HTTP tool used for container health checking
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set container working directory
WORKDIR /app

# Copy dependency requirements first to leverage Docker layer caching
COPY requirements.txt .

# Upgrade pip, install Python dependencies, download spaCy English model, and validate build integrity
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    python -m spacy download en_core_web_sm && \
    python -c "import spacy; nlp = spacy.load('en_core_web_sm'); doc = nlp('Testing full spaCy tokenizer pipeline.'); assert len(doc) == 6"

# Pre-create data, uploads, and temp storage directories
RUN mkdir -p /app/data /app/uploads /app/temp

# Copy application source code
COPY . .

# Copy and setup entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose internal backend port
EXPOSE 8000

# Health check endpoint verification
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/')" || exit 1

# Entrypoint provisions schema if needed, then delegates to CMD
ENTRYPOINT ["docker-entrypoint.sh"]

# Launch FastAPI server via Uvicorn bound to 0.0.0.0:8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
