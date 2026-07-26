import os
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, JSONResponse, Response

app = FastAPI()

PROXY_KEY = os.getenv('PROXY_KEY', '')
PUBLIC_BASE_URL = os.getenv('PUBLIC_BASE_URL', 'https://saunhung-saunhung.hf.space').rstrip('/')
ALLOWED_HOSTS = {
    x.strip().lower()
    for x in os.getenv('ALLOWED_HOSTS', '').split(',')
    if x.strip()
}


def check_auth(key: str | None):
    if PROXY_KEY and key != PROXY_KEY:
        raise HTTPException(status_code=401, detail='Invalid proxy key')


def parse_target(raw: str):
    if not raw:
        raise HTTPException(status_code=400, detail='Missing url')
    target = urlparse(raw)
    if target.scheme not in ('http', 'https') or not target.hostname:
        raise HTTPException(status_code=400, detail='Only HTTP/HTTPS URLs are supported')
    host = target.hostname.lower()
    if ALLOWED_HOSTS and not any(host == item or host.endswith('.' + item) for item in ALLOWED_HOSTS):
        raise HTTPException(status_code=400, detail=f'Host not allowed: {host}')
    if host in ('localhost', '127.0.0.1', '0.0.0.0', '::1') or host.endswith('.local'):
        raise HTTPException(status_code=400, detail='Private hosts are not allowed')
    return target


def source_headers(request: Request, referer: str, origin: str, ua: str, cookie: str, skip_range=False):
    headers = {
        'User-Agent': ua or request.headers.get('user-agent') or
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/150 Mobile Safari/537.36',
        'Accept': request.headers.get('accept', '*/*'),
        'Accept-Encoding': 'identity',
    }
    if referer:
        headers['Referer'] = referer
    if origin:
        headers['Origin'] = origin
        headers['Sec-Fetch-Site'] = 'same-site'
        headers['Sec-Fetch-Mode'] = 'cors'
        headers['Sec-Fetch-Dest'] = 'video'
    if cookie:
        headers['Cookie'] = cookie
    if not skip_range and request.headers.get('range'):
        headers['Range'] = request.headers['range']
    if request.headers.get('if-range'):
        headers['If-Range'] = request.headers['if-range']
    return headers


async def fetch_source(url: str, request: Request, referer='', origin='', ua='', cookie='', skip_range=False):
    headers = source_headers(request, referer, origin, ua, cookie, skip_range)
    client = httpx.AsyncClient(follow_redirects=True, timeout=30, verify=True)
    response = await client.get(url, headers=headers)
    await client.aclose()
    return response


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range, Content-Type, X-Proxy-Key',
        'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type',
        'Cache-Control': 'no-store',
    }


def forward_headers(source):
    result = {}
    for name in ('content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'):
        value = source.headers.get(name)
        if value:
            result[name] = value
    return result


def is_playlist(url: str):
    return '.m3u8' in url.lower() or 'master' in url.lower() or '/hls/' in url.lower()


def resolve_child(raw: str, playlist_url: str):
    from urllib.parse import urljoin, urlsplit, urlunsplit
    absolute = urljoin(playlist_url, raw)
    if raw.startswith(('http://', 'https://')):
        return absolute
    base = urlsplit(playlist_url)
    child = urlsplit(absolute)
    if not child.query and base.query:
        child = child._replace(query=base.query)
    return urlunsplit(child)


def make_proxy_url(target: str, request: Request, referer: str, origin: str, ua: str, cookie: str):
    from urllib.parse import urlencode
    params = {'url': target}
    if referer:
        params['referer'] = referer
    if origin:
        params['origin'] = origin
    if ua:
        params['ua'] = ua
    if cookie:
        params['cookie'] = cookie
    if PROXY_KEY:
        params['key'] = PROXY_KEY
    return PUBLIC_BASE_URL + ('/hls' if is_playlist(target) else '/proxy') + '?' + urlencode(params)


def rewrite_playlist(text: str, playlist_url: str, request: Request, referer: str, origin: str, ua: str, cookie: str):
    output = []
    expect_playlist = False
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            output.append(line)
            continue
        if stripped.startswith('#'):
            if stripped.startswith('#EXT-X-STREAM-INF') or stripped.startswith('#EXT-X-I-FRAME-STREAM-INF') or (stripped.startswith('#EXT-X-MEDIA') and 'TYPE=AUDIO' in stripped.upper()):
                expect_playlist = True
            def replace_uri(match):
                child = resolve_child(match.group(1), playlist_url)
                return f'URI="{make_proxy_url(child, request, referer, origin, ua, cookie)}"'
            import re
            output.append(re.sub(r'URI="([^"]+)"', replace_uri, line))
            continue
        child = resolve_child(stripped, playlist_url)
        output.append(make_proxy_url(child, request, referer, origin, ua, cookie))
        expect_playlist = False
    return '\n'.join(output) + '\n'


@app.middleware('http')
async def cors(request: Request, call_next):
    if request.method == 'OPTIONS':
        return Response(status_code=204, headers=cors_headers())
    response = await call_next(request)
    for key, value in cors_headers().items():
        response.headers[key] = value
    return response


@app.get('/health')
async def health():
    return {'ok': True, 'service': 'hf-umpdl-proxy'}


@app.get('/proxy')
async def proxy(request: Request, url: str = Query(...), referer: str = '', origin: str = '', ua: str = '', cookie: str = '', key: str | None = None):
    check_auth(key)
    parse_target(url)
    source = await fetch_source(url, request, referer, origin, ua, cookie)
    if source.status_code == 403 and request.headers.get('range'):
        source = await fetch_source(url, request, referer, origin, ua, cookie, skip_range=True)
    headers = forward_headers(source)
    headers.update(cors_headers())
    headers['Cache-Control'] = 'no-store'
    return Response(content=source.content, status_code=source.status_code, headers=headers)


@app.get('/hls')
async def hls(request: Request, url: str = Query(...), referer: str = '', origin: str = '', ua: str = '', cookie: str = '', key: str | None = None):
    check_auth(key)
    parse_target(url)
    source = await fetch_source(url, request, referer, origin, ua, cookie, skip_range=True)
    if source.status_code >= 400:
        return Response(content=source.content, status_code=source.status_code, headers=cors_headers())
    content_type = source.headers.get('content-type', '')
    text = source.text
    if '#EXTM3U' not in text and 'mpegurl' not in content_type:
        return JSONResponse({'error': 'Source is not an HLS playlist'}, status_code=415)
    rewritten = rewrite_playlist(text, url, request, referer, origin, ua, cookie)
    headers = cors_headers()
    headers['Content-Type'] = 'application/vnd.apple.mpegurl'
    return Response(content=rewritten, status_code=200, headers=headers)
