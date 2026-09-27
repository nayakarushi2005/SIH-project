import { useEffect, useMemo } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';

/** Draws deck.gl `layers` on the enclosing Google <Map>. Renders no DOM. */
export default function DeckGlOverlay({ layers }) {
  const deck = useMemo(() => new GoogleMapsOverlay({ interleaved: true }), []);
  const map = useMap();

  useEffect(() => {
    deck.setMap(map);
    return () => deck.setMap(null);
  }, [deck, map]);

  useEffect(() => {
    deck.setProps({ layers });
  }, [deck, layers]);

  return null;
}
