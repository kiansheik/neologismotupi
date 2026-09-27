"""First-party, fixed-client authorization-code bridge; NOT a general OIDC provider.

Neo authenticates users with its normal cookie/login/verification flow. Studio only
receives a one-use code and a minimal verified identity, never a password or Neo cookie.
"""
import base64
import hashlib
import hmac
import html
import json
import secrets
import re
import time
import uuid
from datetime import UTC, datetime
from urllib.parse import parse_qs, urlencode, urlsplit
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload
from app.config import get_settings
from app.core.deps import SessionDep, get_current_user_optional
from app.core.errors import raise_api_error
from app.models.studio_identity import StudioLoginCode
from app.models.user import Session, User
from app.security import hash_session_token
from app.services.rate_limit import enforce_rate_limit

router = APIRouter(prefix="/auth/studio", tags=["studio identity"])
TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43}$")
HEADERS = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}

def config():
    settings = get_settings()
    if not settings.studio_sso_enabled:
        raise_api_error(status_code=404, code="identity_disabled", message="Studio sign-in is not enabled")
    for value in (settings.api_public_url, settings.app_public_url, settings.studio_sso_redirect_uri):
        parsed = urlsplit(value)
        if parsed.username or parsed.password or parsed.query or parsed.fragment or not parsed.hostname:
            raise_api_error(status_code=503, code="identity_configuration", message="Identity service configuration required")
        if parsed.scheme != "https" and not (settings.app_env != "production" and parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1", "testserver")):
            raise_api_error(status_code=503, code="identity_configuration", message="Identity service requires HTTPS")
    if not re.fullmatch(r"[A-Za-z0-9_-]{64,256}", settings.studio_sso_client_secret) or urlsplit(settings.studio_sso_redirect_uri).path != "/sso/callback":
        raise_api_error(status_code=503, code="identity_configuration", message="Identity service configuration required")
    return settings

def issuer(settings):
    value = urlsplit(settings.api_public_url)
    return value.scheme + "://" + value.netloc

def checked(params, settings):
    if (params.get("client_id") != settings.studio_sso_client_id or
        params.get("redirect_uri") != settings.studio_sso_redirect_uri or
        params.get("code_challenge_method") != "S256" or
        not TOKEN_PATTERN.fullmatch(params.get("code_challenge", "")) or
        not TOKEN_PATTERN.fullmatch(params.get("state", ""))):
        raise_api_error(status_code=400, code="invalid_authorization", message="Invalid Studio authorization request")
    return {key: params[key] for key in ("client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state")}

def version(user, settings):
    # Opaque keyed revision, not a portable password verifier. Rotates on password/email changes.
    value = "studio-account-v1:" + str(user.id) + ":" + user.email + ":" + user.hashed_password
    return hmac.new(settings.studio_sso_client_secret.encode(), value.encode(), hashlib.sha256).hexdigest()

def proof(params, nonce, session, settings, issued_at):
    value = json.dumps([params, nonce, session, issued_at], sort_keys=True, separators=(",", ":"))
    return hmac.new(settings.secret_key.encode(), value.encode(), hashlib.sha256).hexdigest()

def cookie_name(settings):
    return "__Host-neo-studio-consent" if settings.session_cookie_secure else "neo-dev-studio-consent"

def page(body):
    return HTMLResponse('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Academia Tupi — entrar no Studio</title><style>body{max-width:38rem;margin:10vh auto;padding:1rem;font:18px/1.6 system-ui}button,a{font:inherit}button{padding:.6rem 1rem}</style></head><body><h1>Entrar no Pydicate Studio</h1>' + body + '</body></html>', headers=HEADERS)

@router.get("/authorize")
async def authorize(request: Request, db: SessionDep):
    settings = config()
    if any(len(request.query_params.getlist(k)) != 1 for k in request.query_params):
        raise_api_error(status_code=400, code="invalid_authorization", message="Duplicate authorization parameter")
    params = checked(dict(request.query_params), settings)
    user = await get_current_user_optional(request, db)
    if not user or not user.is_verified:
        # No second password form and no password proxy. Existing login keeps Turnstile,
        # rate limits and email verification. This tab retains the authorization request.
        neo = html.escape(settings.app_public_url.rstrip("/") + "/login", quote=True)
        return page(f'<p>Use sua conta do Neologismos/Academia Tupi. Sua senha fica somente no Neologismos.</p><p><a href="{neo}" target="_blank" rel="noopener noreferrer">Entrar ou criar minha conta no Neologismos (outra aba)</a></p><p>Depois de entrar e verificar seu e-mail, volte a esta aba.</p><form method="get">' + ''.join(f'<input type="hidden" name="{k}" value="{html.escape(v, quote=True)}">' for k,v in params.items()) + '<button>Já entrei — continuar</button></form>')
    nonce = secrets.token_urlsafe(32)
    binding = hash_session_token(request.cookies[settings.session_cookie_name])
    issued_at = str(int(time.time()))
    signature = proof(params, nonce, binding, settings, issued_at)
    fields = {**params, "nonce": nonce, "proof": signature, "issued_at": issued_at}
    response = page('<p>Continuar como <strong>' + html.escape(user.email) + '</strong>?</p><p>O Studio receberá seu identificador, nome e e-mail verificado. O acesso ainda depende de convite; permissões de administrador não são compartilhadas.</p><form method="post">' + ''.join(f'<input type="hidden" name="{k}" value="{html.escape(v, quote=True)}">' for k,v in fields.items()) + '<button>Continuar no Studio</button></form>')
    response.set_cookie(cookie_name(settings), nonce, max_age=600, httponly=True, secure=settings.session_cookie_secure, samesite="strict", path="/")
    await db.commit()
    return response

@router.post("/authorize")
async def approve(request: Request, db: SessionDep):
    settings = config()
    if request.headers.get("origin") != issuer(settings) or request.headers.get("content-type", "").split(";")[0] != "application/x-www-form-urlencoded":
        raise_api_error(status_code=403, code="origin_denied", message="Invalid authorization origin")
    body = await limited_body(request)
    if len(body) > 4096:
        raise_api_error(status_code=413, code="body_limit", message="Request too large")
    try:
        fields = parse_qs(body.decode("utf-8"), keep_blank_values=True)
    except UnicodeDecodeError:
        raise_api_error(status_code=400, code="invalid_authorization", message="Invalid form encoding")
    if any(len(value) != 1 for value in fields.values()):
        raise_api_error(status_code=400, code="invalid_authorization", message="Duplicate authorization parameter")
    fields = {key:value[0] for key,value in fields.items()}
    params = checked(fields, settings)
    user = await get_current_user_optional(request, db)
    if not user or not user.is_active or not user.is_verified:
        raise_api_error(status_code=401, code="verified_login_required", message="Log in with a verified account first")
    nonce = request.cookies.get(cookie_name(settings), "")
    session = hash_session_token(request.cookies[settings.session_cookie_name])
    issued_at = fields.get("issued_at", "")
    if (not re.fullmatch(r"[0-9]{1,12}", issued_at) or not 0 <= time.time()-int(issued_at) <= 600 or
        not TOKEN_PATTERN.fullmatch(fields.get("nonce", "")) or not re.fullmatch(r"[a-f0-9]{64}", fields.get("proof", "")) or
        not TOKEN_PATTERN.fullmatch(nonce) or not hmac.compare_digest(nonce, fields.get("nonce", "")) or
        not hmac.compare_digest(proof(params, nonce, session, settings, issued_at), fields.get("proof", ""))):
        raise_api_error(status_code=403, code="consent_required", message="Reopen the authorization request")
    await enforce_rate_limit(db, action="studio_authorization", scope_key="studio_authorization:"+str(user.id), limit=20, window_seconds=600)
    code = secrets.token_urlsafe(32)
    await db.execute(delete(StudioLoginCode).where(StudioLoginCode.expires_at < int(time.time())))
    db.add(StudioLoginCode(code_hash=hashlib.sha256(code.encode()).hexdigest(),user_id=user.id,
        session_hash=session,challenge=params["code_challenge"],auth_revision=version(user,settings),expires_at=int(time.time())+60))
    await db.commit()
    # Fragment is consumed by Studio's callback page; no code enters proxy query logs.
    response = RedirectResponse(settings.studio_sso_redirect_uri + "#" + urlencode({"code":code,"state":params["state"],"iss":issuer(settings)}),status_code=303,headers=HEADERS)
    response.delete_cookie(cookie_name(settings),path="/",secure=settings.session_cookie_secure,httponly=True,samesite="strict")
    return response

async def limited_body(request):
    chunks = []
    length = 0
    async for chunk in request.stream():
        length += len(chunk)
        if length > 4096:
            raise_api_error(status_code=413, code="body_limit", message="Request too large")
        chunks.append(chunk)
    return b"".join(chunks)

async def client_body(request, settings):
    secret = request.headers.get("x-studio-client-secret", "")
    if len(secret) > 1024 or not hmac.compare_digest(secret.encode(), settings.studio_sso_client_secret.encode()):
        raise_api_error(status_code=401, code="invalid_client", message="Invalid client")
    if request.headers.get("content-type", "").split(";")[0] != "application/json":
        raise_api_error(status_code=415, code="content_type", message="JSON required")
    raw = await limited_body(request)
    if len(raw) > 4096:
        raise_api_error(status_code=413, code="body_limit", message="Request too large")
    try:
        value = json.loads(raw)
        if not isinstance(value,dict): raise ValueError()
        return value
    except (ValueError, TypeError):
        raise_api_error(status_code=400, code="invalid_json", message="Invalid JSON")

def identity(user, settings):
    return {"iss":issuer(settings),"aud":settings.studio_sso_client_id,"sub":str(user.id),
        "email":user.email.lower(),"email_verified":True,"name":user.profile.display_name if user.profile else user.email.split("@")[0],
        "auth_revision":version(user,settings)}

@router.post("/exchange")
async def exchange(request: Request, db: SessionDep):
    settings = config()
    fields = await client_body(request,settings)
    if fields.get("client_id") != settings.studio_sso_client_id or fields.get("redirect_uri") != settings.studio_sso_redirect_uri or not isinstance(fields.get("code"), str) or not isinstance(fields.get("code_verifier"), str) or not TOKEN_PATTERN.fullmatch(fields["code"]) or not TOKEN_PATTERN.fullmatch(fields["code_verifier"]):
        raise_api_error(status_code=400, code="invalid_grant", message="Invalid or expired code")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(fields["code_verifier"].encode()).digest()).rstrip(b"=").decode()
    stmt = delete(StudioLoginCode).where(StudioLoginCode.code_hash == hashlib.sha256(fields["code"].encode()).hexdigest(),
        StudioLoginCode.challenge == challenge,StudioLoginCode.expires_at > int(time.time())).returning(StudioLoginCode.user_id,StudioLoginCode.session_hash,StudioLoginCode.auth_revision)
    code = (await db.execute(stmt)).first()
    if not code:
        raise_api_error(status_code=400, code="invalid_grant", message="Invalid or expired code")
    user = (await db.execute(select(User).options(selectinload(User.profile)).join(Session, Session.user_id==User.id).where(
        User.id==code.user_id, User.is_active.is_(True), User.is_verified.is_(True), Session.token_hash==code.session_hash, Session.expires_at>datetime.now(UTC)))).scalar_one_or_none()
    if not user or not hmac.compare_digest(version(user,settings), code.auth_revision):
        await db.commit()  # Burn codes invalidated by a password reset, logout or account disable.
        raise_api_error(status_code=400, code="invalid_grant", message="Invalid or expired code")
    result=identity(user,settings)
    await db.commit()
    return JSONResponse(result,headers=HEADERS)

@router.post("/introspect")
async def introspect(request: Request, db: SessionDep):
    settings = config()
    fields = await client_body(request,settings)
    try: subject=uuid.UUID(str(fields.get("sub", "")))
    except ValueError: return JSONResponse({"active":False},headers=HEADERS)
    user=(await db.execute(select(User).options(selectinload(User.profile)).where(User.id==subject,User.is_active.is_(True),User.is_verified.is_(True)))).scalar_one_or_none()
    active=bool(user and isinstance(fields.get("auth_revision"),str) and re.fullmatch(r"[a-f0-9]{64}", fields["auth_revision"]) and hmac.compare_digest(version(user,settings),fields["auth_revision"]))
    return JSONResponse({"active":active,**(identity(user,settings) if active else {})},headers=HEADERS)
