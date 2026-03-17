import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
describe('GET /ping', () => {
  it('responds with "pong" and status 200', async () => {
    const res = await request(app).get('/ping');
    expect(res.status).toBe(200);
    expect(res.text).toBe('pong');
  });
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Assert that a section list endpoint behaves correctly.
 * seedSlug — a slug known to exist in the seed file for that section.
 */
function describeListEndpoint(route, seedSlug) {
  describe(`GET /api/${route}`, () => {
    it('returns 200 with a JSON array', async () => {
      const res = await request(app).get(`/api/${route}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('includes at least the seed entry', async () => {
      const res = await request(app).get(`/api/${route}`);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('every entry has title, date and slug', async () => {
      const res = await request(app).get(`/api/${route}`);
      for (const entry of res.body) {
        expect(entry).toHaveProperty('title');
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('slug');
        expect(typeof entry.title).toBe('string');
        expect(typeof entry.slug).toBe('string');
      }
    });

    it('entries are sorted newest-first', async () => {
      const res   = await request(app).get(`/api/${route}`);
      const dates = res.body.map(e => new Date(e.date).getTime());
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
      }
    });
  });

  describe(`GET /api/${route}/:slug`, () => {
    it('returns 200 with meta and content for a known slug', async () => {
      const res = await request(app).get(`/api/${route}/${seedSlug}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('meta');
      expect(res.body).toHaveProperty('content');
    });

    it('meta contains title and slug', async () => {
      const res = await request(app).get(`/api/${route}/${seedSlug}`);
      const { meta } = res.body;
      expect(typeof meta.title).toBe('string');
      expect(meta.slug).toBe(seedSlug);
    });

    it('content is a non-empty string', async () => {
      const res = await request(app).get(`/api/${route}/${seedSlug}`);
      expect(typeof res.body.content).toBe('string');
      expect(res.body.content.length).toBeGreaterThan(0);
    });

    it('returns 404 for an unknown slug', async () => {
      const res = await request(app).get(`/api/${route}/does-not-exist-xyz`);
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('does not expose files outside the content dir (directory traversal)', async () => {
      const res = await request(app).get(`/api/${route}/../../package`);
      expect(res.status).toBe(404);
    });
  });
}

// ---------------------------------------------------------------------------
// All sections
// ---------------------------------------------------------------------------
describeListEndpoint('posts',       'hello-world');
describeListEndpoint('projects',    'hello-world');
describeListEndpoint('music',       'hello-world');
describeListEndpoint('photography', 'hello-world');
