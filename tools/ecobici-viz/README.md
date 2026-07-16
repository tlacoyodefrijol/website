# ecobici-viz

Regenerate `public/ecobici-bg.mp4` for a different date range, using real
Ecobici (Mexico City bike-share) trips. Port of `public/background.js`,
runs headless (no browser).

```sh
pip install -r requirements.txt   # Pillow, numpy
python3 fetch_data.py --start 2026-06-15 --end 2026-06-21 --out data.json
python3 render.py --data data.json --out clip.mp4
```

That's it — those two commands and the two dates are all most people need.
`fetch_data.py` downloads the covering month(s) from Ecobici's open-data
CSVs (cached in `.cache/`, ignored by git) and joins them against the live
GBFS station feed for coordinates. `render.py` takes `--theme light`,
`--duration`, `--fps`, `--width`/`--height` if you want a non-default look;
`--help` on either script lists the rest.

Requires `ffmpeg` on PATH (`.mp4`) or `img2webp` (`.webp`).

Trips are folded onto a single day by time-of-day only, same as the site --
picking a longer date range makes the loop busier, not longer.
