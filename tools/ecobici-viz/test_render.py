import numpy as np
import pytest

import render

# Two stations ~1km apart in CDMX; trips at 00:00, 06:00, and 23:59:59 (lap tail).
DATA = {
    "stations": [[19.40, -99.17], [19.41, -99.16]],
    "trips": [[0, 1, 0], [1, 0, 21600], [0, 1, 86399]],
}
BG = np.array(render.MODE["dark"]["bg"])


def run(data=DATA, **kw):
    args = dict(W=64, H=40, fps=20, duration=2, loop_seconds=1, theme="dark", seed=0) | kw
    return list(render.frames(data, **args))


def test_project_fits_and_centers():
    pts = render.project(DATA["stations"], 64, 40)
    (x0, y0), (x1, y1) = pts
    assert x0 < x1 and y0 > y1  # east is right, north is up
    assert abs((x0 + x1) / 2 - 32) < 1e-9 and abs((y0 + y1) / 2 - 20) < 1e-9


def test_project_single_station_no_crash():
    assert render.project([[19.4, -99.1]], 64, 40) == [(32, 20)]


def test_frames_shape_and_strokes_drawn():
    fs = run()
    assert len(fs) == 40 and fs[0].shape == (40, 64, 3) and fs[0].dtype == np.uint8
    assert any((f != BG).any() for f in fs), "no trip ever drawn"


def test_deterministic_with_seed():
    a, b = run(seed=1), run(seed=1)
    assert all((x == y).all() for x, y in zip(a, b))


def test_lap_tail_trip_not_dropped():
    # Only trip sits at the very end of the day; frame steps (0.05s) skip past it within lap 1.
    # It must still spawn at the wrap instead of being silently dropped.
    fs = run(data={**DATA, "trips": [[0, 1, 86399]]}, duration=1.5)
    assert any((f != BG).any() for f in fs)


def test_no_trips_exits():
    with pytest.raises(SystemExit):
        run(data={**DATA, "trips": []})


@pytest.mark.parametrize("ext", ["webp", pytest.param("mp4", marks=pytest.mark.skipif(
    not render.shutil.which("ffmpeg"), reason="no ffmpeg"))])
def test_encode_writes_file(tmp_path, ext):
    out = str(tmp_path / f"clip.{ext}")
    render.encode(iter(run()), out, 64, 40, 20)
    assert (tmp_path / f"clip.{ext}").stat().st_size > 0
