import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider, Map } from '@vis.gl/react-google-maps';
import { RefreshCw, ZoomIn } from 'lucide-react';

import CanvasHeatmap from '../../components/CanvasHeatmap';
import { Button, EmptyState, INPUT, Notice, PageHeader, Panel, PanelHeader, Tabs } from '../../components/ui';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || 'DEMO_MAP_ID';
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
    colors: ['#C9D6F2', '#8AA4E0', '#4F70C4', '#2B4789'],
  },
  unfilled: {
    label: 'Unfilled',
    help: 'Jobs no worker took',
    weight: (c) => c.unfilled,
    colors: ['#F9C6BE', '#EE7B6B', '#D1432F', '#9E2415'],
  },
  workers: {
    label: 'Workers',
    help: 'Registered workers',
    weight: (c) => c.workers,
    colors: ['#C9E8D5', '#7CC49A', '#3A9463', '#1F6B42'],
  },
  shortage: {
    label: 'Shortage',
    help: 'Jobs per registered worker',
    weight: (c) => c.shortage,
    colors: ['#FCE3B0', '#F5B452', '#DB7A1C', '#A14F06'],
  },
};
const WINDOWS = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];
const LAYER_TABS = Object.entries(LAYERS).map(([key, l]) => ({ key, label: l.label }));

const TH = 'px-4 py-3 text-left text-xs font-medium text-ink-3';
const TD = 'px-4 py-3 align-middle';

const pct = (x) => `${Math.round(x * 100)}%`;

function Stat({ label, value }) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-ink">{value}</dd>
    </div>
  );
}

function HoverRow({ label, value }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

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
      <>
        <PageHeader title="Skill demand map" />
        <Notice tone="warn">
          <p className="font-medium">Google Maps key missing</p>
          <p className="mt-0.5">
            Set <code className="font-mono text-[13px]">VITE_GOOGLE_MAPS_API_KEY</code> in{' '}
            <code className="font-mono text-[13px]">client/.env</code> (Maps JavaScript API, restricted to this site) and
            restart the dev server.
          </p>
        </Notice>
      </>
    );
  }

  const s = data?.summary;
  const tooLarge = error?.code === 'heatmap_area_too_large';

  return (
    <>
      <PageHeader
        title="Skill demand map"
        description="Jobs posted against registered workers in the visible area. Pan and zoom to a city. Areas are grouped into cells of about 500 m to protect privacy."
        actions={
          <Button variant="secondary" onClick={() => changing(setAttempt)(attempt + 1)} disabled={loading || !bounds}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="overflow-x-auto">
          <Tabs items={LAYER_TABS} value={layer} onChange={setLayer} />
        </div>
        <Tabs items={WINDOWS} value={timeWindow} onChange={changing(setTimeWindow)} />
        <select
          aria-label="Trade"
          value={category}
          onChange={(e) => changing(setCategory)(e.target.value)}
          className={`${INPUT} h-9 lg:ml-auto lg:w-64`}
        >
          <option value="">All trades</option>
          {categoryOptions.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Panel className="mb-6 overflow-hidden">
        <dl className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          <Stat label="Jobs posted" value={s ? s.jobs : '-'} />
          <Stat
            label="Unfilled"
            value={s ? `${s.unfilled}${s.jobs ? ` (${pct(s.unfilled / s.jobs)})` : ''}` : '-'}
          />
          <Stat label="Registered workers" value={s ? s.workers : '-'} />
          <Stat label="Jobs per worker" value={s && s.workers ? (s.jobs / s.workers).toFixed(1) : '-'} />
        </dl>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel className="overflow-hidden">
            <div className="relative h-[420px] sm:h-[560px]">
              <APIProvider apiKey={MAPS_KEY}>
                <Map
                  mapId={MAP_ID}
                  mapTypeId="hybrid"
                  defaultCenter={CENTER}
                  defaultZoom={12}
                  gestureHandling="greedy"
                  mapTypeControl={false}
                  streetViewControl={false}
                  onIdle={onIdle}
                  colorScheme="LIGHT"
                >
                  <CanvasHeatmap cells={cells} weight={spec.weight} colors={spec.colors} onHover={setHovered} />
                </Map>
              </APIProvider>

              {tooLarge ? (
                <div className="absolute inset-x-0 top-4 mx-auto flex w-fit items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
                  <ZoomIn className="w-4 h-4 text-ink-3" /> Zoom in to a city to see the map.
                </div>
              ) : error ? (
                <div className="absolute inset-x-0 top-4 mx-auto w-fit rounded-md border border-bad/25 bg-bad-soft px-3 py-2 text-sm text-bad">
                  {error.error || error.message || 'Could not load the map.'}
                </div>
              ) : null}

              {hovered ? (
                <dl className="absolute bottom-4 left-3 space-y-1 rounded-md border border-line bg-surface px-4 py-3 text-sm">
                  <HoverRow label="Jobs" value={hovered.jobs} />
                  <HoverRow label="Unfilled" value={hovered.unfilled} />
                  <HoverRow label="Workers" value={hovered.workers} />
                  <HoverRow label="Jobs per worker" value={hovered.shortage} />
                </dl>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-ink-3">
                {spec.label}: {spec.help.toLowerCase()}. Cells with too little activity are hidden.
              </p>
              <div className="flex items-center gap-2 text-xs text-ink-3" aria-hidden="true">
                Low
                <span className="flex">
                  {spec.colors.map((c) => (
                    <span key={c} className="h-2.5 w-6" style={{ background: c }} />
                  ))}
                </span>
                High
              </div>
            </div>
          </Panel>
        </div>

        <Panel className="flex max-h-[640px] flex-col overflow-hidden">
          <PanelHeader title="Trades most short of workers" description="By share of jobs left unfilled in the visible area." />
          {data?.categories?.length ? (
            <div className="overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-line bg-canvas">
                  <tr>
                    <th className={TH}>Trade</th>
                    <th className={`${TH} text-right`}>Jobs</th>
                    <th className={`${TH} text-right`}>Unfilled</th>
                    <th className={`${TH} text-right`}>Workers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.categories.map((c) => (
                    <tr
                      key={c.category}
                      onClick={() => changing(setCategory)(category === c.category ? '' : c.category)}
                      aria-selected={category === c.category}
                      className={`cursor-pointer ${category === c.category ? 'bg-accent-soft' : 'hover:bg-canvas/60'}`}
                    >
                      <td className={TD}>
                        <p className="font-medium text-ink">{nameOf(c.category)}</p>
                        {catalogue.get(c.category)?.ncoCode ? (
                          <p className="text-xs text-ink-3">NCO {catalogue.get(c.category).ncoCode}</p>
                        ) : null}
                      </td>
                      <td className={`${TD} text-right text-ink-2`}>{c.jobs}</td>
                      <td className={`${TD} text-right`}>
                        <span className={c.unfilledRate >= 0.4 ? 'font-medium text-bad' : 'text-ink-2'}>
                          {pct(c.unfilledRate)}
                        </span>
                      </td>
                      <td className={`${TD} text-right text-ink-2`}>{c.workers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title={loading ? 'Loading trades' : 'No jobs in this area yet'} />
          )}
        </Panel>
      </div>
    </>
  );
}
