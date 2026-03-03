FROM python:3.12-slim

# Install Docker CLI (to run sibling containers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# Audit DB volume
RUN mkdir -p /var/lib/blackarch-mcp
ENV BLACKARCH_AUDIT_DB=/var/lib/blackarch-mcp/audit.db

EXPOSE 8080

CMD ["python", "main.py"]
