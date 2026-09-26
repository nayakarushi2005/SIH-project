import { useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, MapPin } from 'lucide-react';
import { detectCityPin, LOCATION_MESSAGES } from '../utils/location';

const INPUT =
  'w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm';

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
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">City *</label>
          <div className="relative">
            <input
              type="text"
              name="city"
              required
              minLength={2}
              maxLength={60}
              value={city}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder="e.g. Pune"
              className={INPUT}
            />
            <MapPin className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">PIN Code *</label>
          <div className="relative">
            <input
              type="text"
              name="pincode"
              required
              inputMode="numeric"
              pattern="[1-9][0-9]{5}"
              maxLength={6}
              title="6-digit PIN code"
              value={pincode}
              onChange={(e) => onChange({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              placeholder="e.g. 411001"
              className={INPUT}
            />
            <MapPin className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={detect}
          disabled={detecting}
          className="px-4 py-2 border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50"
        >
          {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
          {detecting ? 'Finding your location…' : 'Use my location'}
        </button>
        {note && (
          <p className={`text-xs ${note.tone === 'error' ? 'text-rose-400' : 'text-slate-400'}`} role="status">
            {note.text}
          </p>
        )}
      </div>
    </div>
  );
}
