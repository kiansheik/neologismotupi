# Deploy Templates

This folder contains example production templates:

- `caddy/Caddyfile` for `api.academiatupi.com -> 127.0.0.1:8000`
- `systemd/nheenga-api.service` for FastAPI process management
- `systemd/nheenga-backup.service` and `systemd/nheenga-backup.timer` for scheduled backups

Adjust paths, usernames, and domains before enabling in production.
