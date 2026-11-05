#!/usr/bin/env python3
"""
Render a data.json (from fetch_data.py) into a looping MP4/WebP clip --
a Python port of the site's public/background.js canvas animation, so it
can run headless without a browser.

Usage:
  python3 render.py --data data.json --out clip.mp4
  python3 render.py --data data.json --out clip.webp --theme light
"""
import argparse
import json
import math
import random
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

MODE = {
    "dark": {
        "bg": (0x17, 0x19, 0x1D),
        "colors": ["#e8604f", "#f0a23a", "#2fae8f", "#37b6c9", "#7bd389", "#f3d17a"],
        "weights": [5, 4, 5, 4, 3, 2],
        "base_alpha": 0.62, "line_width": 2, "fade": 0.065,
    },
    "light": {
        "bg": (0xFA, 0xFA, 0xF9),
        "colors": ["#c2452f", "#b8791f", "#1d7a63", "#1f7f93", "#3f8f4f", "#a8862c"],
        "weights": [5, 4, 5, 4, 3, 2],
        "base_alpha": 0.4, "line_width": 2, "fade": 0.06,
    },
}
DAY_SECONDS = 86400
SPEED_PX_S = 260
MIN_TRAVEL, MAX_TRAVEL = 0.35, 4.5
MAX_ACTIVE = 4200
REF_FPS = 60  # the fade constants above were tuned for ~60fps real time


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


@dataclass
class Trip:
    o: int
    d: int
    spawn_abs: float
    travel: float
    color: tuple
    last: tuple


def project(stations, W, H):
    lats = [s[0] for s in stations]
    lons = [s[1] for s in stations]
    lat0 = (min(lats) + max(lats)) / 2
    lat_c, lon_c = lat0, (min(lons) + max(lons)) / 2
    kx = math.cos(math.radians(lat0))
    geo_w = (max(lons) - min(lons)) * kx
    geo_h = max(lats) - min(lats)
    # ponytail: degenerate span (one station, or all on one meridian) falls back to the other axis / 1.
    scale = max(W / geo_w if geo_w else 0, H / geo_h if geo_h else 0) or 1
    scale *= 1.08

    pts = []
    for lat, lon in stations:
        x = W / 2 + (lon - lon_c) * kx * scale
        y = H / 2 - (lat - lat_c) * scale
        pts.append((x, y))
    return pts


def frames(data, W, H, fps, duration, loop_seconds, theme, seed=0):
    """Yield (H, W, 3) uint8 frames. Same seed + data -> identical frames."""
    mode = MODE[theme]
    palette = [hex_to_rgb(c) for c in mode["colors"]]
    stations_px = project(data["stations"], W, H)
    rng = random.Random(seed)

    sorted_trips = sorted(
        ((o, d, ((sec % DAY_SECONDS) / DAY_SECONDS) * loop_seconds) for o, d, sec in data["trips"]),
        key=lambda t: t[2],
    )
    if not sorted_trips:
        sys.exit("No trips in data.json for the requested range/theme.")

    # Fade tuned at REF_FPS; rescale so the same wall-clock decay holds at any output fps.
    fade = 1 - (1 - mode["fade"]) ** (REF_FPS / fps)
    bg_arr = np.array(mode["bg"], dtype=np.float32)
    canvas = np.full((H, W, 3), mode["bg"], dtype=np.float32)
    stroke = Image.new("RGBA", (W, H))
    draw = ImageDraw.Draw(stroke)

    active: list[Trip] = []
    ptr = 0
    prev_cycle = 0.0

    def spawn_until(limit, cycle_base):
        nonlocal ptr
        while ptr < len(sorted_trips) and sorted_trips[ptr][2] <= limit and len(active) < MAX_ACTIVE:
            o, d, spawn = sorted_trips[ptr]
            sx, sy = stations_px[o]
            ex, ey = stations_px[d]
            travel = min(MAX_TRAVEL, max(MIN_TRAVEL, math.hypot(ex - sx, ey - sy) / SPEED_PX_S))
            color = rng.choices(palette, weights=mode["weights"])[0]
            active.append(Trip(o, d, cycle_base + spawn, travel, color, (sx, sy)))
            ptr += 1

    for f in range(int(duration * fps)):
        elapsed = f / fps
        loop_t = elapsed % loop_seconds
        cycle_base = elapsed - loop_t
        if cycle_base > prev_cycle:  # new lap: finish the old lap's tail, then restart
            spawn_until(loop_seconds, prev_cycle)
            ptr, prev_cycle = 0, cycle_base
        spawn_until(loop_t, cycle_base)

        canvas *= 1 - fade
        canvas += bg_arr * fade  # source-over backdrop fill

        stroke.paste((0, 0, 0, 0), (0, 0, W, H))
        kept = []
        for t in active:
            progress = (elapsed - t.spawn_abs) / t.travel
            if progress >= 1 or progress < -0.02:
                continue
            kept.append(t)
            if progress < 0:
                continue
            sx, sy = stations_px[t.o]
            ex, ey = stations_px[t.d]
            nx, ny = sx + (ex - sx) * progress, sy + (ey - sy) * progress
            a = int(mode["base_alpha"] * min(1, min(progress, 1 - progress) * 6) * 255)
            if a > 0:
                draw.line([t.last, (nx, ny)], fill=t.color + (a,), width=mode["line_width"])
            t.last = (nx, ny)
        active = kept

        # 'lighter' (additive) composite, matching background.js -- not normal alpha blending.
        s_arr = np.asarray(stroke, dtype=np.float32)
        canvas += s_arr[..., :3] * (s_arr[..., 3:4] / 255)
        np.clip(canvas, 0, 255, out=canvas)
        yield canvas.astype(np.uint8)


def encode(frame_iter, out_path, W, H, fps):
    n = 0
    if out_path.endswith(".webp"):
        # ponytail: holds every frame in RAM (~W*H*3 each); stream via img2webp if clips get long.
        imgs = [Image.fromarray(a) for a in frame_iter]
        n = len(imgs)
        imgs[0].save(out_path, save_all=True, append_images=imgs[1:], duration=round(1000 / fps),
                     loop=0, quality=75, method=6)
    else:
        if not shutil.which("ffmpeg"):
            sys.exit("ffmpeg not found")
        proc = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
             "-s", f"{W}x{H}", "-framerate", str(fps), "-i", "-",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path],
            stdin=subprocess.PIPE,
        )
        try:
            for a in frame_iter:
                proc.stdin.write(a.tobytes())
                n += 1
        finally:
            proc.stdin.close()
            if proc.wait():
                sys.exit(f"ffmpeg failed (exit {proc.returncode})")
    print(f"Wrote {out_path} ({n} frames)", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data.json")
    ap.add_argument("--out", default="clip.mp4", help=".mp4 or .webp")
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--height", type=int, default=400)
    ap.add_argument("--fps", type=int, default=20)
    ap.add_argument("--duration", type=float, default=6, help="clip length in seconds")
    ap.add_argument("--loop-seconds", type=float, default=90, help="24h folded onto this many seconds, matching background.js")
    ap.add_argument("--theme", choices=["dark", "light"], default="dark")
    ap.add_argument("--seed", type=int, default=0, help="color RNG seed; same seed = same clip")
    args = ap.parse_args()

    data = json.loads(Path(args.data).read_text())
    if args.width % 2 or args.height % 2:
        sys.exit("--width/--height must be even (yuv420p)")
    encode(frames(data, args.width, args.height, args.fps, args.duration, args.loop_seconds, args.theme, args.seed),
           args.out, args.width, args.height, args.fps)


if __name__ == "__main__":
    main()
