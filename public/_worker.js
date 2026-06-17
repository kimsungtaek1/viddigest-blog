const defaultRepo = 'kimsungtaek1/viddigest-blog';
const defaultBranch = 'main';
const defaultAdminLogins = ['kimsungtaek1'];
const sessionCookie = 'vd_admin_session';
const stateCookie = 'vd_oauth_state';
const returnCookie = 'vd_oauth_return';
const sessionMaxAge = 60 * 60 * 24 * 7;
let cachedPostSlugs = null;

function jsonResponse(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  Object.entries(extraHeaders).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else {
      headers.set(key, value);
    }
  });
  return new Response(JSON.stringify(data), { status, headers });
}

function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    if (index === -1) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  return parts.join('; ');
}

function clearCookie(name) {
  return cookie(name, '', { maxAge: 0, expires: new Date(0) });
}

function base64Url(bytes) {
  const raw = Array.from(new Uint8Array(bytes), (byte) => String.fromCharCode(byte)).join('');
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function sign(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return base64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

async function signedSession(env, session) {
  const secret = sessionSecret(env);
  const payload = base64Url(new TextEncoder().encode(JSON.stringify(session)));
  const signature = await sign(secret, payload);
  return `${payload}.${signature}`;
}

async function readSession(request, env) {
  const raw = parseCookies(request)[sessionCookie];
  if (!raw || raw.indexOf('.') === -1) return null;
  const [payload, signature] = raw.split('.');
  const expected = await sign(sessionSecret(env), payload);
  if (signature !== expected) return null;

  try {
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (!session.expires || Date.now() > session.expires) return null;
    return session;
  } catch (error) {
    return null;
  }
}

function sessionSecret(env) {
  return env.SESSION_SECRET || env.GITHUB_OAUTH_CLIENT_SECRET || '';
}

function configured(env) {
  return Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET && sessionSecret(env));
}

function adminLogins(env) {
  const raw = env.ADMIN_GITHUB_LOGINS || '';
  const configuredLogins = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return configuredLogins.length > 0 ? configuredLogins : defaultAdminLogins;
}

function isAdmin(env, session) {
  if (!session || !session.login) return false;
  return adminLogins(env).some((login) => login.toLowerCase() === session.login.toLowerCase());
}

function safeReturnTo(request) {
  const url = new URL(request.url);
  const value = url.searchParams.get('returnTo') || '/';
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function redirect(location, headers = {}) {
  const responseHeaders = new Headers({
    location,
    'cache-control': 'no-store'
  });
  Object.entries(headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => responseHeaders.append(key, item));
    } else {
      responseHeaders.set(key, value);
    }
  });
  return new Response(null, {
    status: 302,
    headers: responseHeaders
  });
}

async function randomState() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function handleLogin(request, env) {
  if (!configured(env)) {
    return jsonResponse({ error: 'GitHub OAuth is not configured.' }, 503);
  }
  const state = await randomState();
  const callbackUrl = new URL('/api/auth/callback', request.url).toString();
  const githubUrl = new URL('https://github.com/login/oauth/authorize');
  githubUrl.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  githubUrl.searchParams.set('redirect_uri', callbackUrl);
  githubUrl.searchParams.set('scope', 'read:user');
  githubUrl.searchParams.set('state', state);

  return redirect(githubUrl.toString(), {
    'set-cookie': [
      cookie(stateCookie, state, { maxAge: 600 }),
      cookie(returnCookie, safeReturnTo(request), { maxAge: 600 })
    ]
  });
}

async function exchangeCode(request, env) {
  const url = new URL(request.url);
  const cookies = parseCookies(request);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  if (!code || !state || cookies[stateCookie] !== state) {
    return jsonResponse({ error: 'Invalid OAuth callback state.' }, 400);
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
      code
    })
  });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenBody.access_token) {
    return jsonResponse({ error: 'Could not exchange GitHub OAuth code.' }, 502);
  }

  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${tokenBody.access_token}`,
      'user-agent': 'viddigest-blog'
    }
  });
  const user = await userResponse.json();
  if (!userResponse.ok || !user.login) {
    return jsonResponse({ error: 'Could not read GitHub user.' }, 502);
  }

  const session = {
    login: user.login,
    id: user.id,
    name: user.name || '',
    avatarUrl: user.avatar_url || '',
    expires: Date.now() + sessionMaxAge * 1000
  };
  const returnTo = cookies[returnCookie] || '/';
  const headers = [
    cookie(sessionCookie, await signedSession(env, session), { maxAge: sessionMaxAge }),
    clearCookie(stateCookie),
    clearCookie(returnCookie)
  ];

  return redirect(returnTo, { 'set-cookie': headers });
}

async function handleMe(request, env) {
  const session = await readSession(request, env);
  return jsonResponse({
    configured: configured(env),
    authenticated: Boolean(session),
    admin: isAdmin(env, session),
    user: session ? {
      login: session.login,
      id: session.id,
      name: session.name,
      avatarUrl: session.avatarUrl
    } : null
  });
}

function handleLogout() {
  return jsonResponse({ ok: true }, 200, { 'set-cookie': clearCookie(sessionCookie) });
}

function getRepo(env) {
  return env.GITHUB_REPOSITORY || defaultRepo;
}

function getBranch(env) {
  return env.GITHUB_BRANCH || defaultBranch;
}

function getWorkflow(env) {
  return env.DELETE_POST_WORKFLOW || 'delete-post.yml';
}

function getAdminToken(env) {
  return env.GITHUB_ADMIN_TOKEN || env.GITHUB_CONTENT_TOKEN || '';
}

function parseDeleteSlug(pathname) {
  const match = pathname.match(/^\/api\/posts\/(.+)\/delete$/);
  if (!match) return '';
  const slug = decodeURIComponent(match[1]);
  if (!slug || slug.includes('/') || slug.includes('\\') || slug === '.' || slug === '..') return '';
  return slug;
}

function parsePostPageSlug(pathname) {
  const match = pathname.match(/^\/posts\/([^/]+)\/(?:index\.html)?$/);
  if (!match) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return '';
  }
}

async function getPostSlugs(request, env) {
  if (cachedPostSlugs) return cachedPostSlugs;
  const postsUrl = new URL('/posts.json', request.url);
  const response = await env.ASSETS.fetch(new Request(postsUrl.toString()));
  if (!response.ok) {
    cachedPostSlugs = new Set();
    return cachedPostSlugs;
  }
  try {
    const posts = await response.json();
    cachedPostSlugs = new Set(posts.map((post) => post.slug).filter(Boolean));
  } catch (error) {
    cachedPostSlugs = new Set();
  }
  return cachedPostSlugs;
}

async function guardPostPage(request, env, pathname) {
  const slug = parsePostPageSlug(pathname);
  if (!slug) return null;
  const slugs = await getPostSlugs(request, env);
  if (slugs.has(slug)) return null;
  return new Response('Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

async function handleDelete(request, env, slug) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  }

  const session = await readSession(request, env);
  if (!session) return jsonResponse({ error: 'Login required.' }, 401);
  if (!isAdmin(env, session)) return jsonResponse({ error: 'Admin login required.' }, 403);

  const token = getAdminToken(env);
  if (!token) {
    return jsonResponse({ error: 'GITHUB_ADMIN_TOKEN is not configured.' }, 503);
  }

  const repo = getRepo(env);
  const workflow = getWorkflow(env);
  const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'viddigest-blog',
      'x-github-api-version': '2022-11-28'
    },
    body: JSON.stringify({
      ref: getBranch(env),
      inputs: {
        slug,
        requested_by: session.login
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    return jsonResponse({ error: 'Could not dispatch delete workflow.', detail: text }, 502);
  }

  return jsonResponse({ ok: true, slug, status: 'queued' }, 202);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/auth/login') return handleLogin(request, env);
    if (url.pathname === '/api/auth/callback') return exchangeCode(request, env);
    if (url.pathname === '/api/auth/me') return handleMe(request, env);
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return handleLogout();

    const deleteSlug = parseDeleteSlug(url.pathname);
    if (deleteSlug) return handleDelete(request, env, deleteSlug);

    if (url.pathname.startsWith('/api/')) {
      return jsonResponse({ error: 'Not found.' }, 404);
    }

    const postGuard = await guardPostPage(request, env, url.pathname);
    if (postGuard) return postGuard;

    return env.ASSETS.fetch(request);
  }
};
