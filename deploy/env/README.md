# Deploy Environment Files

Create these untracked files before running `make deploy-ssh-all`:

1. `deploy/env/api.env`
2. `deploy/env/postgres.env`
3. `deploy/env/stack.env`

Bootstrap from examples:

```bash
cp deploy/env/api.env.example deploy/env/api.env
cp deploy/env/postgres.env.example deploy/env/postgres.env
cp deploy/env/stack.env.example deploy/env/stack.env
```

These files are intentionally gitignored so secrets do not get committed.

Important:
- In `api.env`, `DATABASE_URL` must use host `postgres` for the Docker stack.
- If DB password has special characters (`@`, `!`, `#`, `/`, `:`), URL-encode it.
- `APP_RELEASE` is optional in `api.env`; deploy scripts inject a per-deploy release ID automatically.
- Set `APP_PUBLIC_URL` to your frontend domain (for email verification/reset links).
- For real email delivery in this Docker stack (recommended: Namecheap Private Email relay), keep `EMAIL_DELIVERY=smtp` and set:
  - `SMTP_HOST=smtp-relay`
  - `SMTP_PORT=25`
  - `SMTP_USE_TLS=false`
  - `SMTP_FROM_EMAIL=no-reply@your-domain`
  - keep `SMTP_USERNAME`/`SMTP_PASSWORD` empty in `api.env` (auth happens in `smtp-relay` via `stack.env`)
- `stack.env` should include relay settings for the smtp container:
  - `SMTP_ALLOWED_SENDER_DOMAINS` (required domain allowlist)
  - `SMTP_RELAYHOST=[mail.privateemail.com]:587`
  - `SMTP_RELAYHOST_USERNAME=no-reply@your-domain`
  - `SMTP_RELAYHOST_PASSWORD=<private-email-password>`

DNS/authentication:
- When using Namecheap Private Email, publish the SPF/DKIM records recommended by Namecheap for that mailbox.

Common deploy commands:

```bash
make deploy-daily
make deploy-full
make deploy-reset DEPLOY_SEED_CSV=/absolute/path/neologisms.csv
```

Smoke checks can validate CORS preflight too (default origin is `https://neo.academiatupi.com`):

```bash
make deploy-smoke
```

Example:

```bash
python3 - <<'PY'
from urllib.parse import quote
print(quote("myP@ss!word", safe=""))
PY
```
