import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider, Map } from '@vis.gl/react-google-maps';
import { AlertTriangle, BriefcaseBusiness, Flame, Map as MapIcon, RefreshCw, Users, ZoomIn } from 'lucide-react';

import CanvasHeatmap from '../../components/CanvasHeatmap';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID'; // vector map: smooth zoom, dark theme
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

const CENTER = (() => {
  const [lat, lng] = String(import.meta.env.VITE_MAP_DEFAULT_CENTER ?? '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : { lat: 19.076, lng: 72.8777 };
})();

// What each layer weighs cells by, and its colour ramp (low → high).
const LAYERS = {
  demand: {
    label: 'Demand',
    help: 'Jobs posted',
    weight: (c) => c.jobs,
    colors: ['#7BD3A8', '#F2C94C', '#F2994A', '#D93025'],
  },
  unfilled: {
    label: 'Unfilled',
    help: 'Jobs no worker took',
    weight: (c) => c.unfilled,
    colors: ['#FCBBA1', '#FB6A4A', '#DE2D26', '#A50F15'],
  },
  workers: {
    label: 'Workers',
    help: 'Registered workers',
    weight: (c) => c.workers,
    colors: ['#C7E9C0', '#74C476', '#31A354', '#006D2C'],
  },
  shortage: {
    label: 'Shortage',
    help: 'Jobs per registered worker',
    weight: (c) => c.shortage,
    colors: ['#DADAEB', '#9E9AC8', '#756BB1', '#54278F'],
  },
};
const WINDOWS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

const pct = (x) => `${Math.round(x * 100)}%`;

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex-1 min-w-[140px] p-4 bg-slate-900 border border-slate-800 rounded-2xl">
      <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${tone}`}>
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold text-white">{value}</div>
    </div>
  );
}

/** Government officials: where demand for skilled work outstrips supply. */
export default function DemandMap() {
  const authFetch = useFetchWithAuth();
  const [layer, setLayer] = useState('shortage');
  const [timeWindow, setTimeWindow] = useState('30d');
  const [category, setCategory] = useState('');
  const [catalogue, setCatalogue] = useState(new globalThis.Map());
  const [bounds, setBounds] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [attempt, setAttempt] = useState(0); // bumped by Refresh
  const request = useRef(0);

  // Category names and NCO codes, for the filter and the table.
  useEffect(() => {
    fetch(`${API_BASE}/api/categories?lang=en`)
      .then((res) => res.json())
      .then((body) => {
        const all = body.groups.flatMap((g) => g.categories.map((c) => [c.slug, { ...c, group: g.name }]));
        setCatalogue(new globalThis.Map(all));
      })
      .catch(() => {});
  }, []);

  // Fetch whenever the view or a filter changes; state is set once results
  // arrive, and only for the newest request.
  useEffect(() => {
    if (!bounds) return;
    const id = ++request.current;
    const params = new URLSearchParams({
      sw: `${bounds.south},${bounds.west}`,
      ne: `${bounds.north},${bounds.east}`,
      window: timeWindow,
    });
    if (category) params.set('category', category);
    (async () => {
      try {
        const res = await authFetch(`/api/heatmap/gov?${params}`);
        const body = await res.json();
        if (id !== request.current) return;
        if (res.ok) {
          setData(body);
          setError(null);
        } else {
          setError(body);
        }
      } catch {
        if (id === request.current) setError({ code: 'network', error: 'Could not reach the server.' });
      } finally {
        if (id === request.current) setLoading(false);
      }
    })();
  }, [attempt, authFetch, bounds, category, timeWindow]);

  /** Wraps a filter setter so the refresh icon spins while it reloads. */
  const changing = (setter) => (value) => {
    setLoading(true);
    setter(value);
  };

  const onIdle = useCallback((ev) => {
    const b = ev.map.getBounds()?.toJSON();
    if (b) {
      setLoading(true);
      setBounds(b);
    }
  }, []);

  const spec = LAYERS[layer];
  const cells = useMemo(() => data?.cells ?? [], [data]);

  const categoryOptions = useMemo(
    () => [...catalogue.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [catalogue]
  );
  const nameOf = (slug) => catalogue.get(slug)?.name ?? slug;

  if (!MAPS_KEY) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-8">
        <div className="max-w-lg p-6 bg-slate-900 border border-amber-500/30 rounded-2xl text-sm text-slate-300">
          <div className="flex items-center gap-2 text-amber-400 font-bold mb-2">
            <AlertTriangle className="w-5 h-5" /> Google Maps key missing
          </div>
          Set <code className="text-amber-300">VITE_GOOGLE_MAPS_API_KEY</code> in <code>client/.env</code> (Maps
          JavaScript API, restricted to this site) and restart the dev server.
        </div>
      </div>
    );
  }

  const s = data?.summary;
  const tooLarge = error?.code === 'heatmap_area_too_large';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 pb-6 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2 border border-emerald-500/20">
              <MapIcon className="w-3.5 h-3.5" /> Skill Demand Map
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Where are <span className="text-emerald-400">skills short?</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Jobs posted vs registered workers in the visible area. Pan and zoom to a city; areas are shown as ~500 m
              cells to protect privacy.
            </p>
          </div>
          <button
            onClick={() => changing(setAttempt)(attempt + 1)}
            disabled={loading || !bounds}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border border-slate-800 self-start md:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-3 mb-6">
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto">
            {Object.entries(LAYERS).map(([key, l]) => (
              <button
                key={key}
                onClick={() => setLayer(key)}
                title={l.help}
                className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  layer === key ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                onClick={() => changing(setTimeWindow)(w.value)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  timeWindow === w.value ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <select
            value={category}
            onChange={(e) => changing(setCategory)(e.target.value)}
            className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 lg:ml-auto"
          >
            <option value="">All trades</option>
            {categoryOptions.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Summary */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Stat icon={BriefcaseBusiness} label="Jobs posted" value={s ? s.jobs : '—'} tone="text-amber-400" />
          <Stat
            icon={Flame}
            label="Unfilled"
            value={s ? `${s.unfilled}${s.jobs ? ` (${pct(s.unfilled / s.jobs)})` : ''}` : '—'}
            tone="text-red-400"
          />
          <Stat icon={Users} label="Registered workers" value={s ? s.workers : '—'} tone="text-emerald-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map */}
          <div className="lg:col-span-2">
            <div className="relative h-[560px] rounded-2xl overflow-hidden border border-slate-800">
              <APIProvider apiKey={MAPS_KEY}>
                <Map
                  mapId={MAP_ID}
                  defaultCenter={CENTER}
                  defaultZoom={12}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  onIdle={onIdle}
                  colorScheme="DARK"
                >
                  <CanvasHeatmap cells={cells} weight={spec.weight} colors={spec.colors} onHover={setHovered} />
                </Map>
              </APIProvider>
              {tooLarge ? (
                <div className="absolute inset-x-0 top-4 mx-auto w-fit px-4 py-2 rounded-xl bg-slate-900/90 border border-amber-500/40 text-amber-300 text-sm flex items-center gap-2">
                  <ZoomIn className="w-4 h-4" /> Zoom in to a city to see the map.
                </div>
              ) : error ? (
                <div className="absolute inset-x-0 top-4 mx-auto w-fit px-4 py-2 rounded-xl bg-slate-900/90 border border-red-500/40 text-red-300 text-sm">
                  {error.error || error.message || 'Could not load the map.'}
                </div>
              ) : null}
              {hovered ? (
                <div className="absolute left-4 bottom-4 px-4 py-3 rounded-xl bg-slate-900/95 border border-slate-700 text-sm space-y-0.5">
                  <div>
                    <span className="text-slate-400">Jobs:</span> <b>{hovered.jobs}</b>
                  </div>
                  <div>
                    <span className="text-slate-400">Unfilled:</span> <b>{hovered.unfilled}</b>
                  </div>
                  <div>
                    <span className="text-slate-400">Workers:</span> <b>{hovered.workers}</b>
                  </div>
                  <div>
                    <span className="text-slate-400">Jobs per worker:</span> <b>{hovered.shortage}</b>
                  </div>
                </div>
              ) : null}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {spec.label}: {spec.help.toLowerCase()}. Cells with too little activity are hidden.
            </p>
          </div>

          {/* Trades table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 max-h-[600px] overflow-y-auto">
            <h2 className="text-sm font-bold text-white mb-1">Trades most short of workers</h2>
            <p className="text-xs text-slate-500 mb-3">By share of jobs left unfilled, in the visible area.</p>
            {data?.categories?.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                    <th className="py-2 font-semibold">Trade</th>
                    <th className="py-2 font-semibold text-right">Jobs</th>
                    <th className="py-2 font-semibold text-right">Unfilled</th>
                    <th className="py-2 font-semibold text-right">Workers</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c) => (
                    <tr
                      key={c.category}
                      onClick={() => changing(setCategory)(category === c.category ? '' : c.category)}
                      className={`border-t border-slate-800 cursor-pointer hover:bg-slate-800/60 ${
                        category === c.category ? 'bg-emerald-500/10' : ''
                      }`}
                    >
                      <td className="py-2">
                        <div className="font-semibold text-slate-200">{nameOf(c.category)}</div>
                        {catalogue.get(c.category)?.ncoCode ? (
                          <div className="text-xs text-slate-500">NCO {catalogue.get(c.category).ncoCode}</div>
                        ) : null}
                      </td>
                      <td className="py-2 text-right text-slate-300">{c.jobs}</td>
                      <td className="py-2 text-right">
                        <span className={c.unfilledRate >= 0.4 ? 'text-red-400 font-bold' : 'text-slate-300'}>
                          {pct(c.unfilledRate)}
                        </span>
                      </td>
                      <td className="py-2 text-right text-slate-300">{c.workers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-500">{loading ? 'Loading…' : 'No jobs in this area yet.'}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
