import { Fragment, useCallback, useEffect, useState } from 'react';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';
import { Check, Clock, RefreshCw, ShieldCheck, UserMinus, Users, X } from 'lucide-react';
import { Button, EmptyState, INPUT, Loading, Notice, PageHeader, Panel, Tabs } from '../../components/ui';

const TH = 'px-5 py-3 text-left text-xs font-medium text-ink-3';
const TD = 'px-5 py-3.5 align-middle';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : 'Not set');
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
    <>
      <PageHeader
        title="Worker requests"
        description="Workers in your area who asked to join. Accept a request to add them as a member."
        actions={
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        }
      />

      {unverified ? (
        <Notice tone="warn" icon={Clock}>
          <p className="font-medium">Waiting for government verification</p>
          <p className="mt-0.5">Your federation must be verified by the government before you can accept workers.</p>
        </Notice>
      ) : (
        <>
          <div className="mb-4">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { key: 'pending', label: `Pending (${lists.pending.length})` },
                { key: 'verified', label: `Members (${lists.verified.length})` },
              ]}
            />
          </div>

          {error && <Notice className="mb-4">{error}</Notice>}

          <Panel className="overflow-hidden">
            {loading ? (
              <Loading label="Loading workers" />
            ) : rows.length === 0 ? (
              <EmptyState icon={Users} title={tab === 'pending' ? 'No pending requests' : 'No members yet'} />
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b border-line bg-canvas">
                    <tr>
                      <th className={TH}>Worker</th>
                      <th className={TH}>Work</th>
                      <th className={TH}>Location</th>
                      <th className={TH}>{tab === 'pending' ? 'Requested' : 'Member since'}</th>
                      <th className={`${TH} text-right`}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((row) => (
                      <Fragment key={row.id}>
                        <tr className="hover:bg-canvas/60">
                          <td className={TD}>
                            <p className="font-medium text-ink">{row.worker.name || 'Name not added'}</p>
                            {row.worker.isAadhaarVerified && (
                              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-ok">
                                <ShieldCheck className="w-3.5 h-3.5" /> Aadhaar verified
                              </p>
                            )}
                          </td>
                          <td className={TD}>
                            {row.worker.categories.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {row.worker.categories.map((slug) => (
                                  <span key={slug} className="rounded border border-line bg-canvas px-1.5 py-0.5 text-xs text-ink-2">
                                    {categoryLabel(slug)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-ink-3">Not added</span>
                            )}
                          </td>
                          <td className={`${TD} text-ink-2`}>
                            {[row.worker.city, row.worker.pincode].filter(Boolean).join(', ') || 'Not added'}
                          </td>
                          <td className={`${TD} text-ink-2`}>
                            {formatDate(tab === 'pending' ? row.requestedAt : row.decidedAt)}
                          </td>
                          <td className={`${TD} text-right`}>
                            <div className="inline-flex gap-2">
                              {tab === 'pending' ? (
                                <>
                                  <Button size="sm" onClick={() => accept(row)} disabled={busyId === row.id}>
                                    <Check className="w-4 h-4" /> Accept
                                  </Button>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => {
                                      setRejecting(row.id);
                                      setReason('');
                                    }}
                                    disabled={busyId === row.id}
                                  >
                                    <X className="w-4 h-4" /> Reject
                                  </Button>
                                </>
                              ) : (
                                <Button variant="danger" size="sm" onClick={() => remove(row)} disabled={busyId === row.id}>
                                  <UserMinus className="w-4 h-4" /> Remove
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {rejecting === row.id && (
                          <tr className="bg-canvas/60">
                            <td colSpan={5} className="px-5 py-4">
                              <label htmlFor={`reason-${row.id}`} className="block text-sm font-medium text-ink mb-1.5">
                                Reason for rejecting {row.worker.name || 'this worker'}
                              </label>
                              <textarea
                                id={`reason-${row.id}`}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                maxLength={300}
                                rows={2}
                                placeholder="Optional, for your records"
                                className={`${INPUT} h-auto py-2`}
                              />
                              <div className="mt-3 flex justify-end gap-2">
                                <Button variant="secondary" size="sm" onClick={() => setRejecting(null)}>
                                  Cancel
                                </Button>
                                <Button variant="danger" size="sm" onClick={() => reject(row)} disabled={busyId === row.id}>
                                  Confirm reject
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
