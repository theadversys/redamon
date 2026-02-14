# Agent Testing

## Run tests (from project root)

```bash
docker compose exec agent python test_agent_attack_paths.py
```

## Check connectivity to OpenAI API

```bash
docker compose exec agent python scripts/check_connectivity.py
```

## DNS / network diagnostics (nslookup, curl)

```bash
docker compose exec agent nslookup api.openai.com
docker compose exec agent curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 https://api.openai.com
```

## Run one command at a time

Avoid pasting multiple lines with `#` comments—zsh may misinterpret them. Run each command separately.
