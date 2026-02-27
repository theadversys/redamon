FROM kalilinux/kali-rolling:latest

LABEL maintainer="PandaExploit Project"
LABEL description="Kali Linux sandbox with MCP servers for agentic penetration testing"

# Avoid prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Update CA certificates and configure HTTPS mirror
# The base image should have ca-certificates, we just need to update them
RUN apt-get update -o Acquire::https::Verify-Peer=false \
    && apt-get install -y --no-install-recommends ca-certificates \
    && update-ca-certificates \
    && echo "deb https://kali.download/kali kali-rolling main contrib non-free non-free-firmware" > /etc/apt/sources.list \
    && apt-get update

# Update and install penetration testing tools
RUN apt-get install -y --fix-missing \
    # Core tools
    curl \
    wget \
    git \
    # Python
    python3 \
    python3-pip \
    python3-venv \
    # Nmap (used by naabu via -nmap-cli for service detection)
    nmap \
    # Nikto (web server scanner)
    nikto \
    # Ffuf (web fuzzer)
    ffuf \
    # Gobuster (directory/DNS fuzzer)
    gobuster \
    # Hydra (credential cracker)
    hydra \
    # Sqlmap (SQL injection scanner)
    sqlmap \
    # Metasploit framework
    metasploit-framework \
    # Network utilities
    net-tools \
    iputils-ping \
    dnsutils \
    # Build dependencies for naabu (requires libpcap and build tools)
    libpcap-dev \
    build-essential \
    gcc \
    g++ \
    unzip \
    # Clean up
    && rm -rf /var/lib/apt/lists/*

# Install Go (required for naabu and nuclei)
# Use a newer Go version that's compatible with latest dependencies
RUN wget -q https://go.dev/dl/go1.23.3.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.23.3.linux-amd64.tar.gz \
    && rm go1.23.3.linux-amd64.tar.gz

ENV PATH="${PATH}:/usr/local/go/bin:/root/go/bin"
ENV GOPATH="/root/go"

# Install ProjectDiscovery tools (naabu, nuclei) from pre-built binaries
# Pinned versions avoid GitHub API rate limits at build time
ARG NAABU_VERSION=2.4.0
ARG NUCLEI_VERSION=3.7.0
RUN ARCH=$(dpkg --print-architecture) && \
    case "$ARCH" in amd64) DL_ARCH="amd64";; arm64) DL_ARCH="arm64";; *) DL_ARCH="amd64";; esac && \
    wget -q "https://github.com/projectdiscovery/naabu/releases/download/v${NAABU_VERSION}/naabu_${NAABU_VERSION}_linux_${DL_ARCH}.zip" -O /tmp/naabu.zip && \
    wget -q "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_${DL_ARCH}.zip" -O /tmp/nuclei.zip && \
    unzip -o /tmp/naabu.zip -d /usr/local/bin && unzip -o /tmp/nuclei.zip -d /usr/local/bin && \
    chmod +x /usr/local/bin/naabu /usr/local/bin/nuclei && rm /tmp/naabu.zip /tmp/nuclei.zip

# nuclei -update-templates runs at container start via entrypoint.sh (NUCLEI_AUTO_UPDATE=true)

# Create virtual environment for Python dependencies
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python MCP dependencies
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Create directories
RUN mkdir -p /opt/mcp_servers /opt/output

# Copy MCP servers
COPY servers/ /opt/mcp_servers/

# Copy and set entrypoint script
COPY kali-sandbox/entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh

WORKDIR /opt/mcp_servers

# Expose ports for MCP servers (SSE/HTTP transport)
EXPOSE 8000 8001 8002 8003 8004 8005 8006 8007 8008 8009

# Initialize Metasploit database (speeds up first run)
RUN msfdb init || true

# Entrypoint handles updates + launches MCP servers
ENTRYPOINT ["/opt/entrypoint.sh"]
