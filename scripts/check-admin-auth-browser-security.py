#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
import re
import sys

PAGES = [Path('admin/login.html'), Path('admin/mfa.html')]
SUPABASE_HTTP = 'https://nqklhsfaqpbjqmfzjzxk.supabase.co'
SUPABASE_WS = 'wss://nqklhsfaqpbjqmfzjzxk.supabase.co'

REQUIRED_CSP = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-src 'none'",
    "script-src 'self' https://esm.sh",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    f"connect-src 'self' {SUPABASE_HTTP} {SUPABASE_WS}",
    "img-src 'self' data: blob:",
    "manifest-src 'self'",
    "media-src 'none'",
    "upgrade-insecure-requests",
]

FORBIDDEN_CSP = ["'unsafe-inline'", "'unsafe-eval'", 'frame-ancestors']


class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.metas = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != 'meta':
            return
        self.metas.append({str(k).lower(): (v or '') for k, v in attrs})


def meta_content(parser, *, name=None, http_equiv=None):
    for attrs in parser.metas:
        if name is not None and attrs.get('name', '').lower() == name.lower():
            return attrs.get('content', '')
        if http_equiv is not None and attrs.get('http-equiv', '').lower() == http_equiv.lower():
            return attrs.get('content', '')
    return ''


errors = []

for path in PAGES:
    if not path.exists():
        errors.append(f'{path}: arquivo ausente')
        continue

    text = path.read_text(encoding='utf-8')
    parser = MetaParser()
    parser.feed(text)

    robots = meta_content(parser, name='robots').lower()
    if robots != 'noindex,nofollow,noarchive,nosnippet':
        errors.append(f'{path}: robots administrativo não está em noindex/nofollow/noarchive/nosnippet')

    referrer = meta_content(parser, name='referrer').lower()
    if referrer != 'no-referrer':
        errors.append(f'{path}: referrer policy não está em no-referrer')

    csp = meta_content(parser, http_equiv='Content-Security-Policy')
    if not csp:
        errors.append(f'{path}: CSP via meta ausente')
        continue

    for token in REQUIRED_CSP:
        if token not in csp:
            errors.append(f'{path}: CSP sem diretiva obrigatória: {token}')

    for token in FORBIDDEN_CSP:
        if token in csp:
            errors.append(f'{path}: CSP contém diretiva/escape proibido: {token}')

    if re.search(r'<script\b(?![^>]*\bsrc\s*=)[^>]*>', text, flags=re.IGNORECASE):
        errors.append(f'{path}: script inline detectado')
    if re.search(r'<style\b', text, flags=re.IGNORECASE):
        errors.append(f'{path}: bloco style inline detectado')
    if re.search(r'\sstyle\s*=', text, flags=re.IGNORECASE):
        errors.append(f'{path}: atributo style inline detectado')
    if re.search(r'javascript\s*:', text, flags=re.IGNORECASE):
        errors.append(f'{path}: URL javascript: detectada')

if errors:
    print('Falha no hardening do navegador administrativo:')
    for error in errors:
        print(f' - {error}')
    sys.exit(1)

print('OK: login/MFA mantêm CSP estrita, noindex e referrer=no-referrer.')
