FROM python:3.11-slim

WORKDIR /app

# Install ping, whois for command injection vulns
RUN apt-get update && apt-get install -y --no-install-recommends \
    iputils-ping \
    whois \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY static/ static/

# Create files dir for path traversal
RUN mkdir -p /app/files /app/data

EXPOSE 5000

CMD ["python", "app.py"]
