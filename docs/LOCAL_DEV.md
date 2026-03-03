# Running Without Docker (Local Development)

This guide covers running the PandaExploit webapp and related services outside Docker for faster iteration.

## Agent Zero URL

When running the webapp locally (e.g. `npm run dev` in `webapp/`), the server-side proxy at `/api/a0` needs to reach Agent Zero.

**Required configuration:**

- **Leave `AGENT_ZERO_URL` unset** — the proxy defaults to `http://localhost:50001`
- **Or set** `AGENT_ZERO_URL=http://localhost:50001`

**Do not** set `AGENT_ZERO_URL=http://agent-zero:80` when running outside Docker. The hostname `agent-zero` only resolves inside Docker Compose; you will get `getaddrinfo ENOTFOUND agent-zero` errors.

## Summary

| Environment              | AGENT_ZERO_URL              |
|-------------------------|-----------------------------|
| Local dev (no Docker)    | Unset or `http://localhost:50001` |
| Docker Compose           | `http://agent-zero:80`      |
