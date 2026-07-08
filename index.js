import express from 'express';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import matter from 'gray-matter';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// GET /ping — health check
app.get('/ping', (_req, res) => res.send('pong'));

// ---------------------------------------------------------------------------
// GitHub OAuth relay for the Sveltia/Decap CMS at /admin.
// Only mounted when credentials are present, so the site runs fine without it.
// Set OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET (from a GitHub OAuth App whose
// callback URL is https://<host>/callback) in the server environment.
// ---------------------------------------------------------------------------
const { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET } = process.env;

// Exchange an OAuth code for an access token (Node 16-safe: uses https, not fetch).
function githubExchange(code) {
  const payload = JSON.stringify({
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    code,
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'github.com',
        path: '/login/oauth/access_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'oscarmontiel-cms',
        },
      },
      res => {
        let body = '';
        res.on('data', c => (body += c));
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

if (OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) {
  app.get('/auth', (req, res) => {
    const redirectUri = `https://${req.get('host')}/callback`;
    const url =
      'https://github.com/login/oauth/authorize' +
      `?client_id=${encodeURIComponent(OAUTH_CLIENT_ID)}` +
      // public_repo is enough for a public repo; use 'repo' if it goes private.
      '&scope=public_repo' +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.redirect(url);
  });

  app.get('/callback', async (req, res) => {
    try {
      const data = await githubExchange(req.query.code);
      const ok = Boolean(data.access_token);
      const result = ok
        ? { token: data.access_token, provider: 'github' }
        : { error: data.error_description || data.error || 'Authentication failed' };
      const message = `authorization:github:${ok ? 'success' : 'error'}:${JSON.stringify(result)}`;
      // JSON.stringify makes a safe JS string literal; escape < to avoid </script>.
      const safe = JSON.stringify(message).replace(/</g, '\\u003c');
      res
        .set('Content-Type', 'text/html')
        .send(
          `<!doctype html><body><script>
  (function () {
    var message = ${safe};
    function receive(e) {
      window.opener.postMessage(message, e.origin);
      window.removeEventListener('message', receive, false);
    }
    window.addEventListener('message', receive, false);
    window.opener.postMessage('authorizing:github', '*');
  })();
</script></body>`
        );
    } catch {
      res.status(500).send('OAuth exchange failed');
    }
  });
}

/**
 * Mount list + single-entry routes for a markdown content directory.
 *   GET /api/<route>       → sorted list of frontmatter objects
 *   GET /api/<route>/:slug → { meta, content } for one entry
 */
function mountSection(route, dir) {
  // List
  app.get(`/api/${route}`, async (_req, res) => {
    const files = await readdir(dir);
    const items = await Promise.all(
      files
        .filter(f => f.endsWith('.md'))
        .map(async filename => {
          const raw = await readFile(path.join(dir, filename), 'utf8');
          return matter(raw).data;
        })
    );
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(items);
  });

  // Single entry
  app.get(`/api/${route}/:slug`, async (req, res) => {
    const slug     = path.basename(req.params.slug);
    const filepath = path.join(dir, `${slug}.md`);
    try {
      const raw = await readFile(filepath, 'utf8');
      const { data, content } = matter(raw);
      res.json({ meta: data, content });
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
      throw err;
    }
  });
}

mountSection('posts',       path.join(__dirname, 'posts'));
mountSection('projects',    path.join(__dirname, 'projects'));
mountSection('music',       path.join(__dirname, 'music'));
mountSection('photography', path.join(__dirname, 'photography'));

// Export app for testing (supertest handles its own listen)
export { app };

// Only start the server when run directly, not during tests
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
}
