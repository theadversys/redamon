"""
Centralized HTTP client for agent→webapp API calls.
- Default timeout: 10 seconds
- Retries: 3 with exponential backoff for 5xx and 429
- Error mapping: 401→unauthorized, 403→forbidden, 429→rate_limited, 5xx→server_error
- X-Request-ID and Authorization headers on every request
"""

import os
import logging
import uuid
import asyncio
from typing import Optional, Dict, Any

import httpx

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 10.0
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 1.0


def _get_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    headers: Dict[str, str] = {
        "X-Request-ID": str(uuid.uuid4()),
        "Accept": "application/json",
    }
    token = os.environ.get("AGENT_SERVICE_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if extra:
        user_id = extra.get("X-User-Id")
        if user_id:
            headers["X-User-Id"] = user_id
        for k, v in extra.items():
            if k != "X-User-Id":
                headers[k] = v
    return headers


def _map_error(status_code: int) -> str:
    if status_code == 401:
        return "unauthorized"
    if status_code == 403:
        return "forbidden"
    if status_code == 429:
        return "rate_limited"
    if 500 <= status_code < 600:
        return "server_error"
    return f"http_error_{status_code}"


async def _request_with_retry(
    method: str,
    url: str,
    params: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> tuple[Optional[Dict], Optional[str]]:
    """
    Returns (data, error). If error is not None, data is None.
    """
    retries = 0
    last_error = None

    while retries <= MAX_RETRIES:
        try:
            req_headers = _get_headers(headers or {})
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.request(method, url, params=params, headers=req_headers)

            if resp.status_code == 200:
                return resp.json(), None

            if resp.status_code in (401, 403, 429):
                # No retry for auth/rate limit
                err = _map_error(resp.status_code)
                try:
                    body = resp.json()
                    msg = body.get("message", err)
                except Exception:
                    msg = err
                return None, f"{err}: {msg}"

            if resp.status_code >= 500 and retries < MAX_RETRIES:
                wait = RETRY_BACKOFF_BASE * (2 ** retries)
                logger.warning(f"API {resp.status_code}, retry {retries + 1}/{MAX_RETRIES} after {wait}s")
                await asyncio.sleep(wait)
                retries += 1
                continue

            return None, f"{_map_error(resp.status_code)}: {resp.text[:200]}"

        except httpx.TimeoutException as e:
            last_error = f"timeout: {e}"
            if retries < MAX_RETRIES:
                wait = RETRY_BACKOFF_BASE * (2 ** retries)
                await asyncio.sleep(wait)
                retries += 1
                continue
            return None, last_error
        except httpx.HTTPError as e:
            last_error = str(e)
            if retries < MAX_RETRIES:
                wait = RETRY_BACKOFF_BASE * (2 ** retries)
                await asyncio.sleep(wait)
                retries += 1
                continue
            return None, f"server_error: {last_error}"

    return None, last_error or "server_error"


async def get_github_findings(
    base_url: str,
    project_id: str,
    user_id: str,
    finding_type: str = "",
    secret_type: str = "",
    provider: str = "",
    severity: str = "",
    repo: str = "",
    path: str = "",
    id_: str = "",
    since: str = "",
    limit: int = 200,
    offset: int = 0,
) -> tuple[Optional[Dict], Optional[str]]:
    params: Dict[str, Any] = {
        "projectId": project_id,
        "limit": min(limit, 2000),
        "offset": max(0, offset),
    }
    if finding_type:
        params["findingType"] = finding_type
    if secret_type:
        params["secretType"] = secret_type
    if provider:
        params["provider"] = provider
    if severity:
        params["severity"] = severity
    if repo:
        params["repo"] = repo
    if path:
        params["path"] = path
    if id_:
        params["id"] = id_
    if since:
        params["since"] = since

    url = f"{base_url.rstrip('/')}/api/github-findings"
    return await _request_with_retry(
        "GET",
        url,
        params=params,
        headers={"X-User-Id": user_id},
    )


async def get_github_stats(
    base_url: str,
    project_id: str,
    user_id: str,
) -> tuple[Optional[Dict], Optional[str]]:
    url = f"{base_url.rstrip('/')}/api/github-stats"
    return await _request_with_retry(
        "GET",
        url,
        params={"projectId": project_id},
        headers={"X-User-Id": user_id},
    )
