import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

import { createHeatOverlay } from '../utils/heatCanvas';

/**
 * Heatmap of `cells` on the enclosing Google <Map> (see utils/heatCanvas.js).
 * `weight(cell)` is how hot a cell is; onHover(cell | null) as the pointer moves.
 */
export default function CanvasHeatmap({ cells, weight, colors, onHover }) {
  const map = useMap();
  const heat = useRef(null);

  useEffect(() => {
    if (!map) return undefined;
    const overlay = createHeatOverlay(map);
    heat.current = overlay;
    const move = map.addListener('mousemove', (e) => onHover?.(overlay.cellAt(e.latLng)));
    const out = map.addListener('mouseout', () => onHover?.(null));
    return () => {
      move.remove();
      out.remove();
      overlay.remove();
      heat.current = null;
    };
    // onHover is a state setter; re-creating the overlay for it isn't needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    heat.current?.setData({ cells, weight, colors });
  }, [cells, weight, colors, map]);

  return null;
}
