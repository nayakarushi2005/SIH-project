/**
 * A heatmap drawn on a canvas over a Google Map — soft round spots blended
 * into a colour ramp, like the app's native heatmap. Plain JS so it can be
 * used outside React too.
 *
 *   const heat = createHeatOverlay(map);
 *   heat.setData({ cells, weight, colors, radiusMeters });
 *   heat.cellAt(latLng)   // the cell under a point, for hover
 *   heat.remove();
 *
 * Spots keep their size on the ground (radiusMeters), so they grow and
 * shrink with the map while zooming instead of staying a fixed pixel size.
 */

const EARTH_MPP = 156543.03392; // metres per pixel at zoom 0 on the equator
const MIN_RADIUS_PX = 22; // a spot never shrinks below this when zoomed out
const MIN_ALPHA = 0.25; // the faintest cell still reads as a spot

/** 256 RGBA entries sampled from `colors` (CSS colour strings, low → high). */
function makePalette(colors) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 1;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  colors.forEach((color, i) => grad.addColorStop(i / (colors.length - 1), color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

function metresPerPixel(lat, zoom) {
  return (EARTH_MPP * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

export function createHeatOverlay(map) {
  const { google } = window;
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.pointerEvents = 'none';
  canvas.style.opacity = '0.8';

  let data = { cells: [], weight: () => 0, palette: null, radiusMeters: 1100 };
  let frame = 0;

  const overlay = new google.maps.OverlayView();
  overlay.onAdd = () => overlay.getPanes().overlayLayer.appendChild(canvas);
  overlay.onRemove = () => canvas.remove();
  overlay.draw = () => {
    // Coalesce the bursts of draw() calls a zoom animation produces.
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  };

  function radiusPx() {
    const zoom = map.getZoom() ?? 12;
    const lat = map.getCenter()?.lat() ?? 0;
    return Math.max(MIN_RADIUS_PX, data.radiusMeters / metresPerPixel(lat, zoom));
  }

  function render() {
    const proj = overlay.getProjection();
    const div = map.getDiv();
    if (!proj || !div) return;
    const r = radiusPx();
    const pad = Math.ceil(r);
    const w = div.offsetWidth + pad * 2;
    const h = div.offsetHeight + pad * 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // The canvas covers the visible map plus a margin, placed in the pane's
    // coordinates so it pans with the map between redraws.
    const topLeft = proj.fromLatLngToDivPixel(proj.fromContainerPixelToLatLng(new google.maps.Point(-pad, -pad)));
    canvas.style.left = `${topLeft.x}px`;
    canvas.style.top = `${topLeft.y}px`;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const weights = data.cells.map(data.weight);
    const max = Math.max(0, ...weights);
    if (!data.palette || max <= 0) return;

    // 1. Density: soft black discs, stacked with alpha.
    data.cells.forEach((cell, i) => {
      if (weights[i] <= 0) return;
      const p = proj.fromLatLngToContainerPixel(new google.maps.LatLng(cell.lat, cell.lng));
      const x = p.x + pad;
      const y = p.y + pad;
      if (x < -r || y < -r || x > w + r || y > h + r) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = MIN_ALPHA + (1 - MIN_ALPHA) * (weights[i] / max);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    ctx.globalAlpha = 1;

    // 2. Colour: map each pixel's density onto the palette.
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = img.data;
    const pal = data.palette;
    for (let i = 3; i < px.length; i += 4) {
      const a = px[i];
      if (!a) continue;
      const j = a * 4;
      px[i - 3] = pal[j];
      px[i - 2] = pal[j + 1];
      px[i - 1] = pal[j + 2];
      px[i] = Math.min(255, a * 1.4);
    }
    ctx.putImageData(img, 0, 0);
  }

  overlay.setMap(map);

  return {
    setData({ cells, weight, colors, radiusMeters = 1100 }) {
      data = { cells, weight, palette: makePalette(colors), radiusMeters };
      overlay.draw();
    },
    /** The cell whose spot covers `latLng`, or null. */
    cellAt(latLng) {
      const proj = overlay.getProjection();
      if (!proj) return null;
      const p = proj.fromLatLngToContainerPixel(latLng);
      const r = radiusPx();
      let best = null;
      let bestD = r;
      for (const cell of data.cells) {
        const q = proj.fromLatLngToContainerPixel(new google.maps.LatLng(cell.lat, cell.lng));
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < bestD) {
          best = cell;
          bestD = d;
        }
      }
      return best;
    },
    remove() {
      cancelAnimationFrame(frame);
      overlay.setMap(null);
    },
  };
}
