import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCheck,
  Clock,
  MapPin,
  Mic,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';

// Live view of the Sisterhood Shield for government officials: SOS alerts,
// voice notes with the AI triage, and the blocks with the most reports.
const POLL_MS = 5000;

const TABS = [
  { id: 'active', label: 'Active SOS' },
  { id: 'recent', label: 'Last 24 hours' },
  { id: 'voice', label: 'Voice notes' },
  { id: 'blocks', label: 'Unsafe areas' },
];

const URGENCY_STYLES = {
  CRITICAL: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  HIGH: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  MEDIUM: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  LOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
};

const OUTCOME_LABELS = { false_alarm: 'False alarm', real_emergency: 'Real emergency' };
const TRIGGER_LABELS = {
  button: 'SOS button',
  call: 'Call 112 button',
  voice: 'Voice ("help")',
  volume: 'Volume keys',
  notification: 'Notification',
};

const mapsUrl = ({ lat, lng }) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

function timeAgo(value) {
  if (!value) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(value).toLocaleString();
}

function scoreClass(score) {
  if (score >= 7) return 'text-emerald-400';
  if (score >= 5) return 'text-amber-400';
  if (score >= 3) return 'text-orange-400';
  return 'text-rose-400';
}

function Person({ user }) {
  if (!user) return <span className="text-slate-500">Unknown user</span>;
  return (
    <div className="flex items-center gap-3">
      {user.avatar ? (
        <img src={user.avatar} alt="" className="w-10 h-10 rounded-full border border-slate-700" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-slate-800" />
      )}
      <div>
        <div className="font-bold text-white flex items-center gap-2">
          {user.name || 'Name not shared'}
          {user.isVerified && <ShieldCheck className="w-4 h-4 text-emerald-400" aria-label="Aadhaar verified" />}
        </div>
        <div className="text-xs text-slate-400 flex items-center gap-3">
          {user.phone ? (
            <a href={`tel:+91${user.phone}`} className="flex items-center gap-1 text-blue-400 hover:underline">
              <Phone className="w-3 h-3" /> +91 {user.phone}
            </a>
          ) : (
            <span>No phone</span>
          )}
          <span>Trust {Number(user.trustScore).toFixed(1)} / 10</span>
        </div>
      </div>
    </div>
  );
}

function AlertCard({ alert }) {
  const active = alert.status === 'active';
  return (
    <div
      className={`bg-slate-900 rounded-2xl p-5 border shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
        active ? 'border-rose-500/50' : 'border-slate-800'
      }`}
    >
      <Person user={alert.user} />
      <div className="text-sm text-slate-300 space-y-1 flex-1 lg:px-6">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4 text-slate-500" /> Started {timeAgo(alert.startedAt)}
          </span>
          <span>Last update {timeAgo(alert.lastSeenAt)}</span>
          <span>{TRIGGER_LABELS[alert.trigger] ?? alert.trigger}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400">
          <span>{alert.path?.length ?? 0} positions tracked</span>
          <span className="flex items-center gap-1">
            <Mic className="w-4 h-4" /> {alert.voiceNotes} voice note(s)
          </span>
          {!active && <span>Outcome: {OUTCOME_LABELS[alert.outcome] ?? 'Not answered'}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`px-3 py-1 rounded-full text-xs font-bold uppercase border ${
            active
              ? 'bg-rose-500/15 text-rose-300 border-rose-500/40 animate-pulse'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          {alert.status}
        </span>
        <a
          href={mapsUrl(alert.location)}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2"
        >
          <MapPin className="w-4 h-4" /> Open map
        </a>
      </div>
    </div>
  );
}

function VoiceNoteCard({ note, onListened }) {
  const { analysis } = note;
  return (
    <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-xl space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <Person user={note.user} />
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>{timeAgo(note.createdAt)}</span>
          {analysis.urgency && (
            <span className={`px-3 py-1 rounded-full font-bold border ${URGENCY_STYLES[analysis.urgency]}`}>
              {analysis.urgency}
            </span>
          )}
          {note.listenedAt ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCheck className="w-4 h-4" /> Heard
            </span>
          ) : (
            <span className="text-amber-400 font-semibold">New</span>
          )}
        </div>
      </div>

      <audio controls preload="none" src={note.audioUrl} onPlay={() => !note.listenedAt && onListened(note.id)} className="w-full" />

      {analysis.status === 'done' ? (
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs uppercase font-bold text-slate-500 mb-1">Summary</div>
            <p className="text-slate-200">{analysis.summary}</p>
            <div className="text-xs uppercase font-bold text-slate-500 mt-3 mb-1">Pattern</div>
            <p className="text-slate-300">{analysis.pattern}</p>
          </div>
          <div>
            <div className="text-xs uppercase font-bold text-slate-500 mb-1">Transcript</div>
            <p className="text-slate-300 whitespace-pre-wrap">{analysis.transcript}</p>
            {analysis.actionItems.length > 0 && (
              <>
                <div className="text-xs uppercase font-bold text-slate-500 mt-3 mb-1">Suggested actions</div>
                <ul className="list-disc list-inside text-slate-200 space-y-0.5">
                  {analysis.actionItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {analysis.status === 'pending' && 'AI triage in progress…'}
          {analysis.status === 'failed' && 'AI triage failed — listen to the recording.'}
          {analysis.status === 'skipped' && 'AI triage is not configured on the server.'}
        </p>
      )}

      {note.location && (
        <a href={mapsUrl(note.location)} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
          <MapPin className="w-3 h-3" /> Where it was recorded
        </a>
      )}
    </div>
  );
}

function BlocksTable({ blocks }) {
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-slate-500 border-b border-slate-800">
          <tr>
            <th className="text-left p-4">Area (geohash)</th>
            <th className="text-right p-4">Safety score</th>
            <th className="text-right p-4">SOS reports</th>
            <th className="text-right p-4">Last report</th>
            <th className="p-4" />
          </tr>
        </thead>
        <tbody>
          {blocks.map((b) => (
            <tr key={b.geohash} className="border-b border-slate-800/60 last:border-0">
              <td className="p-4 font-mono text-slate-300">{b.geohash}</td>
              <td className={`p-4 text-right font-bold ${scoreClass(b.score)}`}>{b.score.toFixed(1)}</td>
              <td className="p-4 text-right text-slate-300">{b.sosCount}</td>
              <td className="p-4 text-right text-slate-400">{timeAgo(b.lastSosAt)}</td>
              <td className="p-4 text-right">
                <a href={mapsUrl(b.center)} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                  Map
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SafetyAlerts() {
  const authFetch = useFetchWithAuth();
  const [tab, setTab] = useState('active');
  const [data, setData] = useState({ active: [], recent: [], voice: [], blocks: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (which) => {
      const paths = {
        active: ['/api/gov/safety/alerts?scope=active', 'alerts'],
        recent: ['/api/gov/safety/alerts?scope=recent', 'alerts'],
        voice: ['/api/gov/safety/voice-notes', 'notes'],
        blocks: ['/api/gov/safety/blocks', 'blocks'],
      };
      const [path, key] = paths[which];
      try {
        const res = await authFetch(path);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load safety data.');
        setData((prev) => ({ ...prev, [which]: body[key] ?? [] }));
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [authFetch]
  );

  // The open tab refreshes itself; the active count always does.
  useEffect(() => {
    const refresh = () => {
      load(tab);
      if (tab !== 'active') load('active');
    };
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [tab, load]);

  const markListened = async (id) => {
    const res = await authFetch(`/api/gov/safety/voice-notes/${id}/listened`, { method: 'PATCH' });
    if (!res.ok) return;
    const updated = await res.json();
    setData((prev) => ({
      ...prev,
      voice: prev.voice.map((n) => (n.id === id ? { ...n, listenedAt: updated.listenedAt } : n)),
    }));
  };

  const list = data[tab];
  const activeCount = data.active.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 text-xs font-semibold uppercase tracking-wider mb-2 border border-rose-500/20">
              <ShieldAlert className="w-3.5 h-3.5" /> Sisterhood Shield
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Women&apos;s <span className="text-rose-400">Safety Alerts</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Live SOS alerts from the app. Refreshes every {POLL_MS / 1000} seconds.
            </p>
          </div>
          {activeCount > 0 && (
            <div className="px-4 py-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 flex items-center gap-2 font-bold">
              <AlertTriangle className="w-5 h-5" /> {activeCount} active SOS
            </div>
          )}
        </div>

        <div className="flex flex-wrap bg-slate-900 p-1 rounded-xl border border-slate-800 w-full sm:w-auto mb-6 gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                tab === t.id ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
              {t.id === 'active' && activeCount > 0 ? ` (${activeCount})` : ''}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="bg-slate-900 rounded-2xl p-12 text-center text-slate-400 border border-slate-800">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-rose-400" />
            Loading safety alerts...
          </div>
        ) : list.length === 0 ? (
          <div className="bg-slate-900 rounded-2xl p-12 text-center text-slate-400 border border-slate-800">
            <ShieldCheck className="w-12 h-12 text-emerald-500/60 mx-auto mb-3" />
            <p className="text-lg font-semibold text-slate-300">Nothing here right now</p>
          </div>
        ) : tab === 'voice' ? (
          <div className="space-y-4">
            {list.map((note) => (
              <VoiceNoteCard key={note.id} note={note} onListened={markListened} />
            ))}
          </div>
        ) : tab === 'blocks' ? (
          <BlocksTable blocks={list} />
        ) : (
          <div className="space-y-4">
            {list.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
