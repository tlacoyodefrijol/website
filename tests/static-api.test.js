import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';
import request from 'supertest';
import { app } from '../index.js';

// Guards against the static build (scripts/build-static-api.js) drifting
// from the live Express API it's meant to snapshot.
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));

beforeAll(() => {
  execFileSync('node', ['scripts/build-static-api.js'], { cwd: root });
});

async function readJson(relPath) {
  return JSON.parse(await readFile(path.join(root, 'public', 'api', relPath), 'utf8'));
}

for (const route of ['posts', 'projects', 'music', 'photography']) {
  describe(`static build for ${route}`, () => {
    it('list file matches the live API response', async () => {
      const live   = await request(app).get(`/api/${route}.json`);
      const static_ = await readJson(`${route}.json`);
      expect(static_).toEqual(live.body);
    });

    it('per-slug files match the live API response', async () => {
      const live = await request(app).get(`/api/${route}.json`);
      for (const { slug } of live.body) {
        const liveEntry   = await request(app).get(`/api/${route}/${slug}.json`);
        const staticEntry = await readJson(`${route}/${slug}.json`);
        expect(staticEntry).toEqual(liveEntry.body);
      }
    });
  });
}
