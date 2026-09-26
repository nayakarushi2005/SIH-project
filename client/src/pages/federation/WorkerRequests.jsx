import { useCallback, useEffect, useState } from 'react';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';
import {
  Check,
  Clock,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserMinus,
  Users,
  X,
} from 'lucide-react';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');
const categoryLabel = (slug) => slug.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * Federation portal: workers asking to join (Pending) and current members.
 * Accept / reject requests, remove members. Only verified federations can
 * act — the backend answers 403 `federation_unverified` otherwise.
 */
export default function WorkerRequests() {
  const authFetch = useFetchWithAuth();

  const [tab, setTab] = useState('pending');
  const [lists, setLists] = useState({ pending: [], verified: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unverified, setUnverified] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // membership id with the reason box open
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pending, verified] = await Promise.all(
        ['pending', 'verified'].map(async (status) => {
          const res = await authFetch(`/api/federation/me/requests?status=${status}`);
          const data = await res.json();
          if (res.status === 403 && data.code === 'federation_unverified') {
            setUnverified(true);
            return [];
          }
          if (!res.ok) throw new Error(data.message || 'Could not load worker requests');
          return data.requests;
        })
      );
      setLists({ pending, verified });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    // Load once on open; state updates happen after the requests resolve.
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (id, path, options, onDone) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await authFetch(path, options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Action failed');
      onDone(data.request);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const accept = (row) =>
    act(row.id, `/api/federation/me/requests/${row.id}`, { method: 'PATCH', body: JSON.stringify({ action: 'accept' }) }, (req) =>
      setLists((prev) => ({
        pending: prev.pending.filter((r) => r.id !== row.id),
        verified: [...prev.verified, { ...row, status: req.status, decidedAt: new Date().toISOString() }],
      }))
    );

  const reject = (row) =>
    act(
      row.id,
      `/api/federation/me/requests/${row.id}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'reject', reason: reason.trim() || undefined }) },
      () => {
        setLists((prev) => ({ ...prev, pending: prev.pending.filter((r) => r.id !== row.id) }));
        setRejecting(null);
        setReason('');
      }
    );

  const remove = (row) => {
    if (!window.confirm(`Remove ${row.worker.name || 'this worker'} from your federation?`)) return;
    act(row.id, `/api/federation/me/members/${row.id}`, { method: 'DELETE' }, () =>
      setLists((prev) => ({ ...prev, verified: prev.verified.filter((r) => r.id !== row.id) }))
    );
  };

  const rows = lists[tab];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-2 border border-blue-500/20">
              <Sparkles className="w-3.5 h-3.5" /> Federation Portal
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Worker <span className="text-blue-400">Requests</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Workers in your area who asked to join. Accept to add them as members.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border border-slate-800 self-start md:self-auto shadow-md"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {unverified ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-10 text-center">
            <Clock className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <p className="text-lg font-semibold text-amber-300">Waiting for government verification</p>
            <p className="text-sm text-slate-400 mt-1">
              Your federation must be verified by the government before you can accept workers.
            </p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 w-full sm:w-auto sm:inline-flex mb-6">
              {[
                ['pending', `Pending (${lists.pending.length})`, 'bg-amber-500 text-slate-950'],
                ['verified', `Members (${lists.verified.length})`, 'bg-emerald-600 text-white'],
              ].map(([key, label, active]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    tab === key ? `${active} font-extrabold shadow-md` : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {error && (
              <div className="p-4 mb-6 bg-rose-500/10 text-rose-400 rounded-2xl border border-rose-500/20 text-sm font-medium">
                ⚠️ {error}
              </div>
            )}

            {loading ? (
              <div className="bg-slate-900 rounded-2xl p-12 text-center text-slate-400 border border-slate-800">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-400" />
                Loading workers...
              </div>
            ) : rows.length === 0 ? (
              <div className="bg-slate-900 rounded-2xl p-12 text-center text-slate-400 border border-slate-800">
                <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-lg font-semibold text-slate-300">
                  {tab === 'pending' ? 'No pending requests' : 'No members yet'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl hover:border-slate-700 transition-all"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-lg font-bold text-white">{row.worker.name || 'Name not added'}</h3>
                          {row.worker.isAadhaarVerified && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <ShieldCheck className="w-3 h-3" /> Aadhaar verified
                            </span>
                          )}
                        </div>
                        {row.worker.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {row.worker.categories.map((slug) => (
                              <span key={slug} className="px-2 py-0.5 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700">
                                {categoryLabel(slug)}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-slate-400 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          {[row.worker.city, row.worker.pincode].filter(Boolean).join(' · ') || 'Location not added'}
                          <span className="text-slate-600">•</span>
                          {tab === 'pending' ? `Requested ${formatDate(row.requestedAt)}` : `Member since ${formatDate(row.decidedAt)}`}
                        </p>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        {tab === 'pending' ? (
                          <>
                            <button
                              onClick={() => accept(row)}
                              disabled={busyId === row.id}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <Check className="w-4 h-4" /> Accept
                            </button>
                            <button
                              onClick={() => {
                                setRejecting(row.id);
                                setReason('');
                              }}
                              disabled={busyId === row.id}
                              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <X className="w-4 h-4" /> Reject
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => remove(row)}
                            disabled={busyId === row.id}
                            className="px-4 py-2 border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 rounded-xl text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <UserMinus className="w-4 h-4" /> Remove
                          </button>
                        )}
                      </div>
                    </div>

                    {rejecting === row.id && (
                      <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          maxLength={300}
                          rows={2}
                          placeholder="Reason (optional, for your records)"
                          className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setRejecting(null)} className="px-4 py-2 text-slate-400 hover:text-white text-sm font-semibold">
                            Cancel
                          </button>
                          <button
                            onClick={() => reject(row)}
                            disabled={busyId === row.id}
                            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                          >
                            Confirm reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
