# Deploy Templates

This folder contains example production templates:

- `caddy/Caddyfile` for `api.academiatupi.com -> 127.0.0.1:8000`
- `systemd/nheenga-api.service` for FastAPI process management
- `systemd/nheenga-backup.service` and `systemd/nheenga-backup.timer` for scheduled backups
- `systemd/nheenga-word-of-day.service` and `systemd/nheenga-word-of-day.timer` for the daily newsletter
- `docker-compose.remote.yml` includes `newsletter-scheduler` for the daily Palavra do Dia inside Docker
- `docker-compose.remote.yml` for Docker-based API + Postgres + SMTP relay + Caddy deployment
- `docker/api.Dockerfile` for the API container image
- `env/*.example` for deploy-time environment files
- release-aware smoke checks via `scripts/smoke-api.sh` and deploy ID propagation (`APP_RELEASE`)

Adjust paths, usernames, and domains before enabling in production.
