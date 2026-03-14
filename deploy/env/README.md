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
