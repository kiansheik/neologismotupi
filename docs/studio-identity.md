# Academia Tupi sign-in for Studio

An opt-in, fixed first-party authorization-code bridge. This is not a public OAuth/OIDC
provider and does not offer discovery, refresh tokens or general third-party clients.
Passwords, Argon2 verifiers, Neo cookies and Neo database access are **not** shared with Studio.
Studio keeps its invitations, roles and account status in its own PostgreSQL database.

## User flow

Open the Studio invitation and choose **Entrar com Academia Tupi / Neologismos**. Neo's API
page recognizes the existing Neo cookie and asks the user to continue as their verified email.
When logged out, it links to the existing Neo login page in another tab; registration,
Turnstile and email verification retain their ordinary Neo flow. Return to the authorization
tab and continue. This does not silently enroll every Neo user in Studio.

Studio verifies a single-use, 60-second code using S256 PKCE, exact redirect/client binding,
a confidential client secret and its own browser-bound state. Initial linking requires the
matching valid invitation or explicit authentication of an existing local Studio account.
A matching email alone cannot take over an existing account. No Neo administrator role is
exported. A local Studio recovery administrator remains available during Neo outages.

## Deployment (off by default)

Apply migration `0031_studio_identity`, deploy this branch using the existing Neo deployment
workflow, and set these keys in the **existing private Neo API environment file**, not Git:

```
STUDIO_SSO_ENABLED=true
STUDIO_SSO_CLIENT_ID=pydicate-studio
STUDIO_SSO_CLIENT_SECRET=<the same random 64-character secret provisioned for Studio>
STUDIO_SSO_REDIRECT_URI=https://studio.academiatupi.com/sso/callback
```

Ensure existing `API_PUBLIC_URL=https://api.academiatupi.com` and
`APP_PUBLIC_URL=https://neo.academiatupi.com` remain correct. Studio has a matching secret-file
configuration and `COLLAB_NEO_SSO_ENABLED=1`. The Studio Makefile's `collab-sso-config` command
can prepare these settings on the shared VPS, backing up the private env files first. It does
not restart Neo or edit DNS; deploy Neo and Studio explicitly after reviewing configuration.

No new CORS origin, wildcard cookie domain, shared user database, or new SMTP/DNS record is
required for this bridge. Keep existing cookies host scoped where possible. Do not log the
client secret/header or POST bodies. Authorization codes return in fragments; application
logging omits identity-route query strings. Verify reverse-proxy logging separately.

## Lifecycle and limitations

Studio rechecks Neo account status and a keyed credential revision at most every 60 seconds
of continued access, failing closed if the provider cannot be checked. Password/email changes
and disabled/unverified users invalidate the check. Neo logout invalidates an unredeemed code;
it is **not** cross-application single logout for existing Studio sessions. Full single logout,
MFA and a standards-based general OIDC provider are possible later, not claimed here.

Only ephemeral authorization-code records expire. Neo retains its existing research/data
policies; this change does not copy or delete scholarly records.

## Tests

`cd apps/api && uv sync --frozen && uv run pytest app/tests/test_studio_identity.py`
checks existing-session authentication, code replay, PKCE/client/redirect/consent binding,
verified/active-account gating, reset invalidation, logout and client authentication.

Design reference: OWASP OAuth2 Cheat Sheet
<https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html>.
