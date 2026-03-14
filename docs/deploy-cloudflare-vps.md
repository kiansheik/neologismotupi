# First Production Deploy (Cloudflare Pages + VPS API/Postgres)

This runbook deploys:
- Frontend static site to Cloudflare Pages
- FastAPI + PostgreSQL 17 to one Ubuntu VPS
- API TLS termination via Caddy

## 1. Accounts and services to create

1. Cloudflare account (Pages + DNS).
2. VPS provider account (Ubuntu 24.04 recommended).
3. GitHub repo connected to Cloudflare Pages.

Optional:
- Uptime monitor (UptimeRobot/Better Stack/etc.).
- Off-box backup destination later (S3/R2/B2).

## 1.1 Optional fast path: one-command Docker deploy over SSH

If you want provider portability, this repo includes:

- `deploy/docker-compose.remote.yml` (API + Postgres + Caddy)
- `make deploy-ssh-all ...` (sync + remote docker compose up + migrate)

Quick start:

```bash
cp deploy/env/api.env.example deploy/env/api.env
cp deploy/env/postgres.env.example deploy/env/postgres.env
cp deploy/env/stack.env.example deploy/env/stack.env
make deploy-daily DEPLOY_HOST=<server-ip> DEPLOY_USER=root DEPLOY_PATH=/srv/nheenga-neologismos
```

You still use Cloudflare Pages for frontend.

Deploy commands for a small single-server workflow:

```bash
make deploy-daily
make deploy-full
make deploy-reset DEPLOY_SEED_CSV=/absolute/path/neologisms.csv
```

- `deploy-daily`: API-only rebuild/restart + migration + smoke checks.
- `deploy-full`: full stack compose deploy (API/Postgres/Caddy) + migration + smoke checks.
- `deploy-reset`: destructive DB reset volume + migrate + seed (use only when intentional).

Each deploy carries a unique release ID and polls `https://api.academiatupi.com/healthz` until the API reports that same release.

Notes for `deploy/env/api.env`:
- `DATABASE_URL` should point to `@postgres:5432` in this stack.
- URL-encode password if it has special chars (`@`, `!`, `#`, `/`, `:`), otherwise hostname parsing breaks.
- If Postgres volume already exists, changing env password alone does not reinitialize credentials. Keep credentials stable, or run a reset deploy (`make deploy-reset ...`) when you intentionally need a clean re-init.

Remote requirements for this fast path:

```bash
apt update
apt install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo ${VERSION_CODENAME}) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker deploy
```

Then reconnect SSH so group membership takes effect.

Optional: include DB import in same command:

```bash
make deploy-ssh-all DEPLOY_HOST=<server-ip> DEPLOY_DB_DUMP=backups/docker-postgres/<dump-file>.sql.gz
```

Optional: seed from CSV in same command:

```bash
make deploy-ssh-all DEPLOY_HOST=<server-ip> DEPLOY_SEED_CSV=/absolute/path/neologisms.csv
```

Optional: force reset old containers/images before deploy:

```bash
make deploy-ssh-all DEPLOY_HOST=<server-ip> DEPLOY_RESET_STACK=1
```

To also wipe volumes (destructive, removes DB data):

```bash
make deploy-ssh-all DEPLOY_HOST=<server-ip> DEPLOY_RESET_STACK=1 DEPLOY_RESET_VOLUMES=1
```

## 2. Why your Cloudflare wizard failed

You used a Workers-style deploy command:

```bash
npx wrangler deploy
```

This repo frontend is static Vite output, so use **Cloudflare Pages build settings** instead of Workers deploy.

## 3. Cloudflare Pages setup (correct for this repo)

Create a **Pages project** from GitHub repo and use:

- Framework preset: `None` (or `Vite` if offered)
- Build command: `pnpm --dir apps/web build`
- Build output directory: `apps/web/dist`
- Root directory: leave empty (repo root)
- Deploy command: leave empty / disabled

Important:
- Do **not** set deploy command to `npx wrangler deploy` for this project.
- If Cloudflare forces a deploy command in your UI, use:
  - `npx wrangler pages deploy apps/web/dist --project-name <your-pages-project-name>`

Set environment variables in Pages:

- `VITE_API_BASE_URL=https://api.academiatupi.com/api`
- `VITE_APP_NAME=Nheenga Neologismos`
- `VITE_TURNSTILE_SITE_KEY=<your-site-key-or-empty>`

Notes:
- SPA routing fallback is included via `apps/web/public/_redirects`.
- Node 22.x is fine for this Vite version.

## 4. Provision the VPS (Ubuntu 24.04)

SSH in as root, then run:

```bash
apt update && apt upgrade -y
apt install -y git curl unzip build-essential postgresql postgresql-contrib caddy
```

Create deploy user:

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Install `uv` as deploy user:

```bash
sudo -u deploy -H bash -lc 'curl -LsSf https://astral.sh/uv/install.sh | sh'
```

Clone repo:

```bash
sudo -u deploy -H bash -lc 'git clone <YOUR_GIT_URL> /srv/nheenga-neologismos'
```

## 5. Create production PostgreSQL DB and user on VPS

```bash
sudo -u postgres psql <<'SQL'
CREATE USER nheenga WITH PASSWORD 'change-this-password';
CREATE DATABASE nheenga_prod OWNER nheenga;
GRANT ALL PRIVILEGES ON DATABASE nheenga_prod TO nheenga;
SQL
```

## 6. Prepare API env on VPS

```bash
sudo -u deploy -H bash -lc 'cp /srv/nheenga-neologismos/apps/api/.env.production.example /srv/nheenga-neologismos/apps/api/.env.production'
```

Edit `/srv/nheenga-neologismos/apps/api/.env.production`:

- `DATABASE_URL=postgresql+asyncpg://nheenga:<password>@localhost:5432/nheenga_prod`
- `SECRET_KEY=<long-random-32+-char-string>`
- `CORS_ORIGINS=https://www.academiatupi.com`
- `FIRST_USER_IS_ADMIN=false`
- `SESSION_COOKIE_SECURE=true`
- `SESSION_COOKIE_DOMAIN=` (host-only cookie, scoped to `api.academiatupi.com`)

Install API deps:

```bash
sudo -u deploy -H bash -lc 'cd /srv/nheenga-neologismos/apps/api && ~/.local/bin/uv sync'
```

Validate config:

```bash
sudo -u deploy -H bash -lc 'cd /srv/nheenga-neologismos && API_ENV_FILE=/srv/nheenga-neologismos/apps/api/.env.production make prod-check'
```

## 7. Copy local Docker DB to VPS Postgres

On your local machine:

```bash
cd /path/to/neologismotupi
make db-dump-docker
```

This creates a dump under `backups/docker-postgres/`.

Copy dump to VPS:

```bash
scp backups/docker-postgres/<latest-file>.sql.gz deploy@<VPS_IP>:/tmp/nheenga.sql.gz
```

Restore on VPS:

```bash
ssh deploy@<VPS_IP> \
  'DUMP_FILE=/tmp/nheenga.sql.gz DATABASE_URL=postgresql://nheenga:<password>@localhost:5432/nheenga_prod \
   /srv/nheenga-neologismos/scripts/restore-postgres-from-dump.sh'
```

Then run migrations (safe/idempotent):

```bash
ssh deploy@<VPS_IP> \
  'cd /srv/nheenga-neologismos/apps/api && set -a && source .env.production && set +a && ~/.local/bin/uv run alembic upgrade head'
```

## 8. Run API under systemd

Copy unit files:

```bash
sudo cp /srv/nheenga-neologismos/deploy/systemd/nheenga-api.service /etc/systemd/system/
sudo cp /srv/nheenga-neologismos/deploy/systemd/nheenga-backup.service /etc/systemd/system/
sudo cp /srv/nheenga-neologismos/deploy/systemd/nheenga-backup.timer /etc/systemd/system/
```

Adjust service paths/users if needed, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nheenga-api.service
sudo systemctl enable --now nheenga-backup.timer
sudo systemctl status nheenga-api.service
```

## 9. Configure Caddy and DNS

Use template:

```bash
sudo cp /srv/nheenga-neologismos/deploy/caddy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Cloudflare DNS records:

- `A api -> <VPS_IP>` (proxied or DNS-only; either works)
- `CNAME www -> <your-pages-project>.pages.dev` (proxied)
- `A @ -> <VPS_IP>` only if you want apex redirect there; otherwise redirect in Cloudflare rules.

## 10. First smoke checks

API:

```bash
curl -i https://api.academiatupi.com/healthz
```

Frontend:

- Open `https://www.academiatupi.com`
- verify login/signup
- verify API requests go to `https://api.academiatupi.com/api`

Create first admin explicitly:

```bash
ssh deploy@<VPS_IP> \
  'cd /srv/nheenga-neologismos && make bootstrap-admin EMAIL=you@example.com PASSWORD="very-strong-password" DISPLAY_NAME="Admin"'
```

## 11. Post-deploy checks

1. Confirm backups are created in `backups/postgres` on VPS.
2. Add an uptime check for `https://api.academiatupi.com/healthz`.
3. Rotate DB/app secrets from initial bootstrap values.
4. Add off-box backup copy as next hardening step.
