"""
Credential and secret sanitization for PandaExploit.

Redacts sensitive patterns before logging and before storing in Neo4j evidence.
Uses a curated set of patterns. Document coverage: common API keys, tokens,
passwords in URLs, Bearer tokens. Does NOT cover: all base64-encoded creds,
JWTs (partial), connection strings with custom formats.

See: TruffleHog regexes, secrets-patterns-db for extended coverage.
"""

import re
from typing import Optional

# Redaction placeholder
REDACTED = "[REDACTED]"

# Curated patterns (order matters - more specific first)
_PATTERNS = [
    # Bearer tokens
    (re.compile(r'Bearer\s+[A-Za-z0-9\-_\.]+', re.I), f"Bearer {REDACTED}"),
    (re.compile(r'Authorization:\s*Bearer\s+[A-Za-z0-9\-_\.]+', re.I), f"Authorization: Bearer {REDACTED}"),
    # Common API key patterns
    (re.compile(r'api[_-]?key["\']?\s*[:=]\s*["\']?[A-Za-z0-9\-_]{20,}["\']?', re.I), f"api_key={REDACTED}"),
    (re.compile(r'apikey["\']?\s*[:=]\s*["\']?[A-Za-z0-9\-_]{20,}["\']?', re.I), f"apikey={REDACTED}"),
    (re.compile(r'sk_live_[0-9a-zA-Z]{24,}'), "sk_live_[REDACTED]"),
    (re.compile(r'sk_test_[0-9a-zA-Z]{24,}'), "sk_test_[REDACTED]"),
    (re.compile(r'AKIA[0-9A-Z]{16}'), "AKIA[REDACTED]"),
    (re.compile(r'AIza[0-9A-Za-z\-_]{35}'), "AIza[REDACTED]"),
    # Password in URL
    (re.compile(r'([?&])password=([^&\s]+)', re.I), r'\1password=' + REDACTED),
    (re.compile(r'([?&])passwd=([^&\s]+)', re.I), r'\1passwd=' + REDACTED),
    (re.compile(r'([?&])pwd=([^&\s]+)', re.I), r'\1pwd=' + REDACTED),
    (re.compile(r'([?&])token=([^&\s]+)', re.I), r'\1token=' + REDACTED),
    (re.compile(r'([?&])secret=([^&\s]+)', re.I), r'\1secret=' + REDACTED),
    # Password in key=value
    (re.compile(r'password["\']?\s*[:=]\s*["\']?[^\s"\'&]+["\']?', re.I), f"password={REDACTED}"),
    (re.compile(r'passwd["\']?\s*[:=]\s*["\']?[^\s"\'&]+["\']?', re.I), f"passwd={REDACTED}"),
    (re.compile(r'secret["\']?\s*[:=]\s*["\']?[^\s"\'&]{8,}["\']?', re.I), f"secret={REDACTED}"),
    (re.compile(r'token["\']?\s*[:=]\s*["\']?[A-Za-z0-9\-_\.]{20,}["\']?', re.I), f"token={REDACTED}"),
]


def sanitize_for_log(text: Optional[str]) -> str:
    """
    Redact sensitive patterns from text before logging or storing.

    Args:
        text: Raw text that may contain credentials

    Returns:
        Sanitized string safe for logs and evidence storage
    """
    if text is None or not isinstance(text, str):
        return ""
    result = text
    for pattern, replacement in _PATTERNS:
        result = pattern.sub(replacement, result)
    return result
