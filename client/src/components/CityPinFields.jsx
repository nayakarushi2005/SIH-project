import { useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, MapPin } from 'lucide-react';
import { detectCityPin, LOCATION_MESSAGES } from '../utils/location';
import { Button, INPUT, LABEL } from './ui';

/**
 * City + PIN inputs with a "Use my location" button that fills them in.
 * Both stay editable — the detected values are only a starting point.
 * `onChange` gets only the fields that changed ({ city } / { pincode }), so
 * the parent merges them into its state. `autoDetect` runs the lookup once
 * when the fields appear.
 */
export default function CityPinFields({ city, pincode, onChange, autoDetect = false }) {
  const [detecting, setDetecting] = useState(false);
  const [note, setNote] = useState(null); // { tone: 'info' | 'error', text }

  const detect = async () => {
    setDetecting(true);
    setNote(null);
    try {
      const found = await detectCityPin();
      // Only fill what the map knows; anything already typed stays.
      const patch = {};
      if (found.city) patch.city = found.city;
      if (found.pincode) patch.pincode = found.pincode;
      onChange(patch);
      if (!found.city || !found.pincode) {
        setNote({ tone: 'info', text: `Found your area, but not the ${!found.pincode ? 'PIN code' : 'city'}. Please type it.` });
      } else {
        setNote({ tone: 'info', text: 'Filled from your location. Check and edit if needed.' });
      }
    } catch (err) {
      setNote({ tone: 'error', text: LOCATION_MESSAGES[err.code] || LOCATION_MESSAGES.unavailable });
    } finally {
      setDetecting(false);
    }
  };

  const ran = useRef(false);
  useEffect(() => {
    if (autoDetect && !ran.current) {
      ran.current = true;
      detect();
    }
  }, [autoDetect]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      {/* Workers see federations with their PIN code, or in their city. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="city" className={LABEL}>City <span className="text-ink-3 font-normal">(required)</span></label>
          <div className="relative">
            <input
              type="text"
              id="city"
              name="city"
              required
              minLength={2}
              maxLength={60}
              value={city}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder="e.g. Pune"
              className={`${INPUT} pl-9`}
            />
            <MapPin className="w-4 h-4 text-ink-3 absolute left-3 top-3 pointer-events-none" />
          </div>
        </div>

        <div>
          <label htmlFor="pincode" className={LABEL}>PIN code <span className="text-ink-3 font-normal">(required)</span></label>
          <div className="relative">
            <input
              type="text"
              id="pincode"
              name="pincode"
              required
              inputMode="numeric"
              pattern="[1-9][0-9]{5}"
              maxLength={6}
              title="6-digit PIN code"
              value={pincode}
              onChange={(e) => onChange({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              placeholder="e.g. 411001"
              className={`${INPUT} pl-9`}
            />
            <MapPin className="w-4 h-4 text-ink-3 absolute left-3 top-3 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={detect} disabled={detecting}>
          {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
          {detecting ? 'Finding your location…' : 'Use my location'}
        </Button>
        {note && (
          <p className={`text-xs ${note.tone === 'error' ? 'text-bad' : 'text-ink-3'}`} role="status">
            {note.text}
          </p>
        )}
      </div>
    </div>
  );
}
