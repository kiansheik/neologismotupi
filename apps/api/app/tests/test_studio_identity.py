"""Tests use existing login/session/verification, never a password copy to Studio."""
import base64
import hashlib
import html
import re
import secrets
from urllib.parse import parse_qs, urlsplit
import pytest
from sqlalchemy import select
from app.config import get_settings
from app import db as database
from app.models.user import User
from app.models.studio_identity import StudioLoginCode

pytestmark=pytest.mark.asyncio

@pytest.fixture
async def sso(client,monkeypatch):
    for k,v in {"STUDIO_SSO_ENABLED":"true","STUDIO_SSO_CLIENT_SECRET":"a"*64,
        "API_PUBLIC_URL":"http://testserver","APP_PUBLIC_URL":"http://localhost:5173",
        "STUDIO_SSO_REDIRECT_URI":"http://localhost:8787/sso/callback"}.items():monkeypatch.setenv(k,v)
    get_settings.cache_clear()
    result=await client.post('/api/auth/register',json={"email":"student@example.org","password":"a good existing neo password","display_name":"Student"})
    assert result.status_code==201,result.text
    return client

def query(**overrides):
    verifier=secrets.token_urlsafe(32)
    value={"client_id":"pydicate-studio","redirect_uri":"http://localhost:8787/sso/callback","state":secrets.token_urlsafe(32),
        "code_challenge_method":"S256","code_challenge":base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode(),**overrides}
    return verifier,value

async def consent(client,params):
    response=await client.get('/api/auth/studio/authorize',params=params)
    assert response.status_code==200,response.text
    fields={k:html.unescape(v) for k,v in re.findall(r'name="([^"]+)" value="([^"]*)"',response.text)}
    response=await client.post('/api/auth/studio/authorize',data=fields,headers={'Origin':'http://testserver'})
    assert response.status_code==303,response.text
    return parse_qs(urlsplit(response.headers['location']).fragment)['code'][0]

async def exchange(client,code,verifier,**overrides):
    return await client.post('/api/auth/studio/exchange',headers={'X-Studio-Client-Secret':'a'*64},json={
        'client_id':'pydicate-studio','redirect_uri':'http://localhost:8787/sso/callback','code':code,'code_verifier':verifier,**overrides})

async def test_disabled_by_default(client):
    assert (await client.get('/api/auth/studio/authorize')).status_code==404

async def test_existing_neo_session_yields_single_use_minimal_identity(sso):
    verifier,params=query();code=await consent(sso,params)
    async with database.AsyncSessionLocal() as db:
        row=(await db.execute(select(StudioLoginCode))).scalar_one();assert row.code_hash!=code
    result=await exchange(sso,code,verifier);assert result.status_code==200,result.text
    value=result.json();assert value['email']=='student@example.org';assert value['email_verified'] is True
    assert set(value)=={'iss','aud','sub','email','email_verified','name','auth_revision'}
    assert 'password' not in result.text and 'session' not in result.text
    assert (await exchange(sso,code,verifier)).status_code==400

async def test_pkce_redirect_client_and_consent_are_bound(sso):
    _,invalid=query(redirect_uri='https://evil.example/sso/callback');assert (await sso.get('/api/auth/studio/authorize',params=invalid)).status_code==400
    _,invalid=query(code_challenge_method='plain');assert (await sso.get('/api/auth/studio/authorize',params=invalid)).status_code==400
    verifier,params=query();page=await sso.get('/api/auth/studio/authorize',params=params)
    fields={k:html.unescape(v) for k,v in re.findall(r'name="([^"]+)" value="([^"]*)"',page.text)}
    assert (await sso.post('/api/auth/studio/authorize',data=fields,headers={'Origin':'https://evil.example'})).status_code==403
    fields['state']=secrets.token_urlsafe(32)
    assert (await sso.post('/api/auth/studio/authorize',data=fields,headers={'Origin':'http://testserver'})).status_code==403
    code=await consent(sso,params)
    assert (await exchange(sso,code,secrets.token_urlsafe(32))).status_code==400
    assert (await exchange(sso,code,verifier)).status_code==200

async def test_unverified_or_disabled_account_cannot_authorize(sso):
    _,params=query()
    async with database.AsyncSessionLocal() as db:
        user=(await db.execute(select(User))).scalar_one();user.is_verified=False;await db.commit()
    page=await sso.get('/api/auth/studio/authorize',params=params)
    assert 'Já entrei' in page.text and 'Continuar como' not in page.text
    async with database.AsyncSessionLocal() as db:
        user=(await db.execute(select(User))).scalar_one();user.is_verified=True;user.is_active=False;await db.commit()
    page=await sso.get('/api/auth/studio/authorize',params=params);assert 'Continuar como' not in page.text

async def test_password_reset_invalidates_grants_and_introspection(sso):
    verifier,params=query();code=await consent(sso,params)
    value=(await exchange(sso,code,verifier)).json()
    payload={'sub':value['sub'],'auth_revision':value['auth_revision']}
    headers={'X-Studio-Client-Secret':'a'*64}
    assert (await sso.post('/api/auth/studio/introspect',headers=headers,json=payload)).json()['active'] is True
    verifier,params=query();code=await consent(sso,params)
    async with database.AsyncSessionLocal() as db:
        user=(await db.execute(select(User))).scalar_one();user.hashed_password='different hash';await db.commit()
    assert (await exchange(sso,code,verifier)).status_code==400
    assert (await sso.post('/api/auth/studio/introspect',headers=headers,json=payload)).json()['active'] is False

async def test_missing_client_secret_and_logout_rejected(sso):
    verifier,params=query();code=await consent(sso,params)
    assert (await sso.post('/api/auth/studio/exchange',json={'code':code})).status_code==401
    await sso.post('/api/auth/logout')
    assert (await exchange(sso,code,verifier)).status_code==400
