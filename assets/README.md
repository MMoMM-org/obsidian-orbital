# assets/ — build-time inlined binary assets

Anything in this directory is consumed by `esbuild`'s `dataurl` loader (see
`esbuild.config.mjs`) and inlined into `main.js`. It is **not** shipped as
a sibling file in the GitHub release.

## Why inlining is mandatory

The Obsidian Community Plugins installer and BRAT both fetch only:

- `main.js`
- `manifest.json`
- `styles.css`

Anything else in the release zip is silently dropped. A non-developer install
that depends on `assets/foo.png` at runtime will 404. The fix is structural,
not compensatory: inline the asset into `main.js` so it travels with the
bundle.

## Plugin hanko (印, the seal)

This plugin can ship a 144×144 PNG hanko at `orbit_hanko_144.png`,
imported from `src/settings/HeaderSection.ts`. 144×144 is 2× HiDPI of the
72×72 rendered size and adds ~36 KB to `main.js`. Avoid the README-grade
1024×1024 original — it bloats the bundle by ~1.4 MB.

To wire up your hanko:

1. Drop the PNG at `assets/orbit_hanko_144.png`.
2. In `src/settings/HeaderSection.ts`, uncomment the `import hankoImageUrl …`
   line and remove the `const hankoImageUrl: string | null = null` fallback.
3. Update the `HeaderSection` test in `test/settings/HeaderSection.test.ts`
   to assert the image element is rendered (mirror Kado's
   `renders the hanko image without a runtime asset resolver` test).

### Transparent outer background (required)

The hanko PNG **must** ship with a transparent outer background. A solid
white background looks fine on light Obsidian themes but renders the seal
inside a white square on dark themes.

Do **not** use a global "replace white with alpha=0" — that destroys the
white characters and distress marks inside the red stamp. Instead,
flood-fill from the four image edges so transparency only spreads through
edge-connected near-white pixels and never crosses the red border.

#### Recipe (Pillow, 4-connected, threshold 230)

Run this once on your stamp asset:

```python
from PIL import Image
from collections import deque

src, dst, threshold = "assets/orbit_hanko_144.png", "assets/orbit_hanko_144.png", 230
img = Image.open(src).convert("RGBA")
w, h = img.size
px = img.load()

def near_white(rgba):
    r, g, b, a = rgba
    return a > 0 and r >= threshold and g >= threshold and b >= threshold

visited = [[False] * h for _ in range(w)]
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if near_white(px[x, y]) and not visited[x][y]:
            visited[x][y] = True; q.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        if near_white(px[x, y]) and not visited[x][y]:
            visited[x][y] = True; q.append((x, y))

while q:
    x, y = q.popleft()
    px[x, y] = (255, 255, 255, 0)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
            if near_white(px[nx, ny]):
                visited[nx][ny] = True; q.append((nx, ny))

img.save(dst, "PNG", optimize=True)
```

Threshold 230 worked for Kado's stamp; raise (240–250) for stamps with
heavier red-edge antialiasing, lower if interior whites start bleeding.
