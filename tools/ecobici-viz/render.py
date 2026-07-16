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
import tempfile
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
    scale = max(W / geo_w, H / geo_h) * 1.08

    pts = []
    for lat, lon in stations:
        x = W / 2 + (lon - lon_c) * kx * scale
        y = H / 2 - (lat - lat_c) * scale
        pts.append((x, y))
    return pts


def render(data, out_path, W, H, fps, duration, loop_seconds, theme):
    mode = MODE[theme]
    palette = [hex_to_rgb(c) for c in mode["colors"]]
    stations_px = project(data["stations"], W, H)

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

    active: list[Trip] = []
    ptr = 0
    n_frames = int(duration * fps)
    frame_dir = Path(tempfile.mkdtemp(prefix="ecobici-frames-"))

    for f in range(n_frames):
        elapsed = f / fps
        loop_t = elapsed % loop_seconds
        cycle_base = elapsed - loop_t
        if ptr > 0 and loop_t < sorted_trips[ptr - 1][2]:
            ptr = 0  # wrapped to a new lap
        while ptr < len(sorted_trips) and sorted_trips[ptr][2] <= loop_t and len(active) < MAX_ACTIVE:
            o, d, spawn = sorted_trips[ptr]
            sx, sy = stations_px[o]
            ex, ey = stations_px[d]
            dist = math.hypot(ex - sx, ey - sy)
            travel = min(MAX_TRAVEL, max(MIN_TRAVEL, dist / SPEED_PX_S))
            color = random.choices(palette, weights=mode["weights"])[0]
            active.append(Trip(o, d, cycle_base + spawn, travel, color, (sx, sy)))
            ptr += 1

        canvas[:] = canvas * (1 - fade) + bg_arr * fade  # source-over backdrop fill

        stroke = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(stroke)
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
            fade_in_out = min(1, min(progress, 1 - progress) * 6)
            a = int(mode["base_alpha"] * fade_in_out * 255)
            if a > 0:
                draw.line([t.last, (nx, ny)], fill=t.color + (a,), width=mode["line_width"])
            t.last = (nx, ny)
        active = kept

        # 'lighter' (additive) composite, matching background.js -- not normal alpha blending.
        stroke_arr = np.asarray(stroke, dtype=np.float32)
        stroke_rgb, stroke_a = stroke_arr[..., :3], stroke_arr[..., 3:4] / 255
        canvas[:] = np.clip(canvas + stroke_rgb * stroke_a, 0, 255)

        Image.fromarray(canvas.astype(np.uint8)).save(frame_dir / f"frame{f:04d}.jpg", quality=85)
        if f % max(1, n_frames // 10) == 0:
            print(f"  frame {f}/{n_frames}", file=sys.stderr)

    encode(frame_dir, out_path, fps)
    shutil.rmtree(frame_dir, ignore_errors=True)


def encode(frame_dir: Path, out_path: str, fps: int):
    if out_path.endswith(".webp"):
        if not shutil.which("img2webp"):
            sys.exit("img2webp not found (brew install webp / apt install webp)")
        frames = sorted(frame_dir.glob("*.jpg"))
        subprocess.run(
            ["img2webp", "-loop", "0", "-lossy", "-q", "75", "-m", "6", "-d", str(round(1000 / fps)),
             *[str(f) for f in frames], "-o", out_path],
            check=True,
        )
    else:
        if not shutil.which("ffmpeg"):
            sys.exit("ffmpeg not found")
        subprocess.run(
            ["ffmpeg", "-y", "-framerate", str(fps), "-i", str(frame_dir / "frame%04d.jpg"),
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path],
            check=True, capture_output=True,
        )
    print(f"Wrote {out_path}", file=sys.stderr)


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
    args = ap.parse_args()

    data = json.loads(Path(args.data).read_text())
    render(data, args.out, args.width, args.height, args.fps, args.duration, args.loop_seconds, args.theme)


if __name__ == "__main__":
    main()
