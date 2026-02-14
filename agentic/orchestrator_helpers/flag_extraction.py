"""
Structured flag extraction for CTF-style outputs.

Extracts flags from tool output using regex patterns and validates format.
"""

import re
import logging
from typing import List, Set

logger = logging.getLogger(__name__)

# Common CTF flag patterns (case-insensitive where appropriate)
FLAG_PATTERNS = [
    # flag{...} - most common
    re.compile(r'flag\{[^\}]+\}', re.IGNORECASE),
    # FLAG{...}
    re.compile(r'FLAG\{[^\}]+\}'),
    # CTF{...}
    re.compile(r'CTF\{[^\}]+\}', re.IGNORECASE),
    # picoCTF{...}
    re.compile(r'picoCTF\{[^\}]+\}'),
    # HTB{...} (HackTheBox)
    re.compile(r'HTB\{[^\}]+\}'),
    # THM{...} (TryHackMe)
    re.compile(r'THM\{[^\}]+\}'),
    # Generic secret/flag patterns
    re.compile(r'[a-zA-Z0-9_]+\{[a-zA-Z0-9_\-]+\}'),  # word{content}
]


def extract_flags(text: str) -> List[str]:
    """
    Extract all flag-like strings from text using regex patterns.

    Args:
        text: Raw tool output or any string to scan

    Returns:
        List of unique flags found, in order of first occurrence
    """
    if not text or not isinstance(text, str):
        return []

    seen: Set[str] = set()
    flags: List[str] = []

    for pattern in FLAG_PATTERNS:
        for match in pattern.finditer(text):
            flag = match.group(0).strip()
            if flag and flag not in seen:
                seen.add(flag)
                flags.append(flag)
                logger.info(f"Extracted flag: {flag[:50]}...")

    return flags


def validate_flag_format(flag: str) -> bool:
    """
    Basic validation that a string looks like a valid flag.

    Args:
        flag: Candidate flag string

    Returns:
        True if format appears valid
    """
    if not flag or len(flag) < 5:
        return False
    # Must have opening brace
    if '{' not in flag or '}' not in flag:
        return False
    # Content between braces should be non-empty
    start = flag.index('{')
    end = flag.index('}')
    if end <= start + 1:
        return False
    return True
