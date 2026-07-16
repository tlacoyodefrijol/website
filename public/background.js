/*
 * Background: a week of real Ecobici (Mexico City bike-share) trips,
 * replayed as glowing traced routes between real station coordinates.
 * Data: /ecobici-week.json — 312,345 trips, Mon 15–Sun 21 Jun 2026.
 * All seven days are folded onto a single 24h clock (by time-of-day) and
 * that one day compresses into a 90s loop, repeating forever.
 */
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const MODE = {
    // retuned complementary palette (not the site's own accents, not brt.fyi's literal colors)
    dark: {
      colors: ['#e8604f', '#f0a23a', '#2fae8f', '#37b6c9', '#7bd389', '#f3d17a'],
      weights: [5, 4, 5, 4, 3, 2],
      baseAlpha: 0.62, lineWidth: 1.15, fade: 0.065, composite: 'lighter',
    },
    light: {
      colors: ['#c2452f', '#b8791f', '#1d7a63', '#1f7f93', '#3f8f4f', '#a8862c'],
      weights: [5, 4, 5, 4, 3, 2],
      baseAlpha: 0.4, lineWidth: 1.0, fade: 0.06, composite: 'source-over',
    },
  };

  function isLight() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }
  function bgColor() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    return v || (isLight() ? '#fafaf9' : '#17191d');
  }

  let mode = MODE[isLight() ? 'light' : 'dark'];
  let weightedPool = [];
  function buildPool() {
    weightedPool = [];
    mode.colors.forEach((c, i) => {
      for (let k = 0; k < (mode.weights[i] || 1); k++) weightedPool.push(c);
    });
  }
  function pickColor() {
    return weightedPool[(Math.random() * weightedPool.length) | 0];
  }

  let DATA = null;
  let sortedTrips = [];
  let stationsPx = [];
  let lat0 = 0, lonCenter = 0, latCenter = 0, geoScale = 1;
  let W = 0, H = 0, dpr = 1;

  const LOOP_SECONDS = 90; // one folded day
  const DAY_SECONDS = 86400;
  const SPEED_PX_S = 260;
  const MIN_TRAVEL = 0.35;
  const MAX_TRAVEL = 4.5;
  const MAX_ACTIVE = 4200;

  function computeBounds() {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const [la, lo] of DATA.stations) {
      if (la < a) a = la;
      if (la > b) b = la;
      if (lo < c) c = lo;
      if (lo > d) d = lo;
    }
    lat0 = (a + b) / 2;
    latCenter = (a + b) / 2;
    lonCenter = (c + d) / 2;
  }

  // "cover" fit: project so the trip network fills the whole viewport,
  // cropping overflow on one axis — like a background photo, not a letterboxed map
  function project(lat, lon) {
    const kx = Math.cos((lat0 * Math.PI) / 180);
    const x = W / 2 + (lon - lonCenter) * kx * geoScale;
    const y = H / 2 - (lat - latCenter) * geoScale;
    return [x, y];
  }

  function paintBackdrop(alpha) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = bgColor();
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function resize() {
    if (!DATA) return; // nothing to project until the trip data has loaded

    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const [la, lo] of DATA.stations) {
      if (la < a) a = la;
      if (la > b) b = la;
      if (lo < c) c = lo;
      if (lo > d) d = lo;
    }
    const kx = Math.cos((lat0 * Math.PI) / 180);
    const geoW = (d - c) * kx;
    const geoH = b - a;
    // cover: pick the larger of the two scales so both axes are fully filled,
    // then overscan slightly so edge stations sit inside the frame, not on it
    geoScale = Math.max(W / geoW, H / geoH) * 1.08;

    stationsPx = DATA.stations.map(([la, lo]) => project(la, lo));
    paintBackdrop(1);
  }

  let ptr = 0;
  let cycleStart = 0;
  const active = [];

  function spawnParticle(trip, cycleBase) {
    const [sx, sy] = stationsPx[trip.o];
    const [ex, ey] = stationsPx[trip.d];
    const dist = Math.hypot(ex - sx, ey - sy);
    const travelTime = Math.min(MAX_TRAVEL, Math.max(MIN_TRAVEL, dist / SPEED_PX_S));
    active.push({
      o: trip.o, d: trip.d,
      spawnAbs: cycleBase + trip.spawn,
      travelTime,
      color: pickColor(),
      lastX: sx, lastY: sy,
    });
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let rafId = null;
  let t0 = null;

  function frame(now) {
    if (t0 === null) t0 = now;
    const elapsed = (now - t0) / 1000;

    const cycleIndex = Math.floor(elapsed / LOOP_SECONDS);
    const loopT = elapsed - cycleIndex * LOOP_SECONDS;
    const cycleBase = cycleIndex * LOOP_SECONDS;

    if (cycleBase !== cycleStart) { cycleStart = cycleBase; ptr = 0; }

    while (ptr < sortedTrips.length && sortedTrips[ptr].spawn <= loopT && active.length < MAX_ACTIVE) {
      spawnParticle(sortedTrips[ptr], cycleBase);
      ptr++;
    }

    paintBackdrop(mode.fade);
    ctx.globalCompositeOperation = mode.composite;
    ctx.lineWidth = mode.lineWidth;
    ctx.lineCap = 'round';

    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      const progress = (elapsed - p.spawnAbs) / p.travelTime;
      if (progress >= 1 || progress < -0.02) { active.splice(i, 1); continue; }
      if (progress < 0) continue;

      const [sx, sy] = stationsPx[p.o];
      const [ex, ey] = stationsPx[p.d];
      const nx = sx + (ex - sx) * progress;
      const ny = sy + (ey - sy) * progress;

      const fadeInOut = Math.min(1, Math.min(progress, 1 - progress) * 6);
      ctx.globalAlpha = mode.baseAlpha * fadeInOut;
      ctx.strokeStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(p.lastX, p.lastY);
      ctx.lineTo(nx, ny);
      ctx.stroke();

      p.lastX = nx;
      p.lastY = ny;
    }
    ctx.globalAlpha = 1;

    rafId = requestAnimationFrame(frame);
  }

  function renderStatic() {
    paintBackdrop(1);
    ctx.globalCompositeOperation = mode.composite;
    ctx.lineWidth = mode.lineWidth * 0.9;
    ctx.lineCap = 'round';
    ctx.globalAlpha = Math.min(0.09, mode.baseAlpha * 0.16);
    for (const trip of sortedTrips) {
      const [sx, sy] = stationsPx[trip.o];
      const [ex, ey] = stationsPx[trip.d];
      ctx.strokeStyle = pickColor();
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function start() {
    if (rafId) cancelAnimationFrame(rafId);
    active.length = 0;
    ptr = 0;
    t0 = null;
    cycleStart = 0;
    if (reduceMotion.matches) renderStatic();
    else rafId = requestAnimationFrame(frame);
  }

  function retheme() {
    mode = MODE[isLight() ? 'light' : 'dark'];
    buildPool();
    paintBackdrop(1);
  }

  window.addEventListener('resize', () => {
    resize();
    if (reduceMotion.matches) renderStatic();
  });
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', start);

  const toggle = document.querySelector('.theme-toggle');
  if (toggle) toggle.addEventListener('click', () => setTimeout(retheme, 0));

  buildPool();

  fetch('/ecobici-week.json')
    .then((r) => r.json())
    .then((data) => {
      DATA = data;
      // fold every day of the week onto one 24h clock, by time-of-day only
      sortedTrips = DATA.trips
        .map(([o, d, startSec]) => ({ o, d, spawn: ((startSec % DAY_SECONDS) / DAY_SECONDS) * LOOP_SECONDS }))
        .sort((a, b) => a.spawn - b.spawn);
      computeBounds();
      resize();
      start();
    })
    .catch((err) => console.error('background.js: failed to load trip data', err));
});
