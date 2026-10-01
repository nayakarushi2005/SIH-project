import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';
import {
  Check,
  CircleCheck,
  Clock,
  FileSpreadsheet,
  RefreshCw,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Button, EmptyState, INPUT, Loading, Notice, PageHeader, Panel, Tabs } from '../../components/ui';
import WorkerAvatar from '../../components/WorkerAvatar';
import AddWorkerDialog from '../../components/AddWorkerDialog';
import ImportWorkersDialog from '../../components/ImportWorkersDialog';
import { maskAadhaar } from '../../utils/workerFields';

const TH = 'px-5 py-3 text-left text-xs font-medium text-ink-3 whitespace-nowrap';
const TD = 'px-5 py-3.5 align-middle';

const EMPTY_LISTS = { pending: [], appMembers: [], roster: [] };

const SOURCE_LABEL = {
  app: 'App request',
  manual: 'Added by hand',
  import: 'Excel import',
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : 'Not set');
const categoryLabel = (slug) => slug.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const timeOf = (value) => (value ? new Date(value).getTime() || 0 : 0);

function OrNotAdded({ value }) {
  return value ? value : <span className="text-ink-3">Not added</span>;
}

function WorkerCell({ name, photoUrl, aadhaarVerified }) {
  return (
    <div className="flex min-w-48 items-center gap-3">
      <WorkerAvatar name={name} photoUrl={photoUrl} />
      <div className="min-w-0">
        <p className="font-medium text-ink">{name || 'Name not added'}</p>
        {aadhaarVerified && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-ok">
            <ShieldCheck className="w-3.5 h-3.5" /> Aadhaar verified
          </p>
        )}
      </div>
    </div>
  );
}

function fromAppMember(row) {
  return {
    key: `app-${row.id}`,
    id: row.id,
    kind: 'app',
    name: row.worker.name,
    phone: row.worker.phone,
    aadhaar: row.worker.aadhaar,
    photoUrl: row.worker.photoUrl,
    aadhaarVerified: row.worker.isAadhaarVerified,
    source: 'app',
    since: row.decidedAt,
  };
}

function fromRosterWorker(worker) {
  return {
    key: `roster-${worker.id}`,
    id: worker.id,
    kind: 'roster',
    name: worker.name,
    phone: worker.phone,
    aadhaar: worker.aadhaar,
    photoUrl: worker.photoUrl,
    aadhaarVerified: false,
    source: worker.source,
    since: worker.addedAt,
  };
}

async function fetchWorkerLists(authFetch) {
  const request = async (path) => {
    const res = await authFetch(path);
    const data = await res.json().catch(() => ({}));
    if (res.status === 403 && data.code === 'federation_unverified') return { unverified: true };
    if (!res.ok) throw new Error(data.message || 'Could not load workers');
    return { data };
  };

  const [pending, appMembers, roster] = await Promise.all([
    request('/api/federation/me/requests?status=pending'),
    request('/api/federation/me/requests?status=verified'),
    request('/api/federation/me/workers'),
  ]);
  if (pending.unverified || appMembers.unverified || roster.unverified) return { unverified: true };
  return {
    lists: {
      pending: pending.data.requests || [],
      appMembers: appMembers.data.requests || [],
      roster: roster.data.workers || [],
    },
  };
}

export default function WorkerManagement() {
  const authFetch = useFetchWithAuth();
  const authFetchRef = useRef(authFetch);

  const [tab, setTab] = useState('pending');
  const [lists, setLists] = useState(EMPTY_LISTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [access, setAccess] = useState('unknown');
  const [busyKey, setBusyKey] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [dialog, setDialog] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  useEffect(() => {
    let active = true;
    fetchWorkerLists(authFetchRef.current).then(
      (result) => {
        if (!active) return;
        setAccess(result.unverified ? 'unverified' : 'verified');
        setLists(result.unverified ? EMPTY_LISTS : result.lists);
        setLoading(false);
      },
      (err) => {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      }
    );
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const reload = () => {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
  };

  const members = useMemo(
    () =>
      [...lists.appMembers.map(fromAppMember), ...lists.roster.map(fromRosterWorker)].sort(
        (a, b) => timeOf(b.since) - timeOf(a.since)
      ),
    [lists.appMembers, lists.roster]
  );

  const act = async (key, path, options, onDone) => {
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      const res = await authFetch(path, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Action failed');
      onDone(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  };

  const accept = (row) =>
    act(
      `app-${row.id}`,
      `/api/federation/me/requests/${row.id}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'accept' }) },
      (data) =>
        setLists((prev) => ({
          ...prev,
          pending: prev.pending.filter((r) => r.id !== row.id),
          appMembers: [
            ...prev.appMembers,
            { ...row, status: data.request?.status || 'verified', decidedAt: new Date().toISOString() },
          ],
        }))
    );

  const reject = (row) =>
    act(
      `app-${row.id}`,
      `/api/federation/me/requests/${row.id}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'reject', reason: reason.trim() || undefined }) },
      () => {
        setLists((prev) => ({ ...prev, pending: prev.pending.filter((r) => r.id !== row.id) }));
        setRejecting(null);
        setReason('');
      }
    );

  const remove = (member) => {
    if (!window.confirm(`Remove ${member.name || 'this worker'} from your federation?`)) return;
    if (member.kind === 'app') {
      act(member.key, `/api/federation/me/members/${member.id}`, { method: 'DELETE' }, () =>
        setLists((prev) => ({ ...prev, appMembers: prev.appMembers.filter((r) => r.id !== member.id) }))
      );
    } else {
      act(member.key, `/api/federation/me/workers/${member.id}`, { method: 'DELETE' }, () =>
        setLists((prev) => ({ ...prev, roster: prev.roster.filter((w) => w.id !== member.id) }))
      );
    }
  };

  const openDialog = (name) => {
    setNotice(null);
    setDialog(name);
  };

  const handleAdded = (worker) => {
    setDialog(null);
    setLists((prev) => ({ ...prev, roster: [worker, ...prev.roster.filter((w) => w.id !== worker.id)] }));
    setTab('verified');
    setNotice(`Added ${worker.name}.`);
  };

  const handleImported = () => {
    setTab('verified');
    reload();
  };

  const rowCount = tab === 'pending' ? lists.pending.length : members.length;

  return (
    <>
      <PageHeader
        title="Worker management"
        description="Add workers by hand, import them from an Excel sheet, or accept requests sent from the app."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={reload} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            {access === 'verified' && (
              <>
                <Button variant="secondary" onClick={() => openDialog('import')}>
                  <FileSpreadsheet className="w-4 h-4" /> Import from Excel
                </Button>
                <Button onClick={() => openDialog('add')}>
                  <UserPlus className="w-4 h-4" /> Add worker
                </Button>
              </>
            )}
          </div>
        }
      />

      {access === 'unverified' ? (
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
                { key: 'verified', label: `Members (${members.length})` },
              ]}
            />
          </div>

          {notice && (
            <Notice tone="ok" icon={CircleCheck} onDismiss={() => setNotice(null)} className="mb-4">
              {notice}
            </Notice>
          )}
          {error && <Notice className="mb-4">{error}</Notice>}

          <Panel className="overflow-hidden">
            {loading ? (
              <Loading label="Loading workers" />
            ) : rowCount === 0 ? (
              <EmptyState icon={Users} title={tab === 'pending' ? 'No pending requests' : 'No members yet'} />
            ) : tab === 'pending' ? (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="border-b border-line bg-canvas">
                    <tr>
                      <th className={TH}>Worker</th>
                      <th className={TH}>Mobile</th>
                      <th className={TH}>Aadhaar</th>
                      <th className={TH}>Work</th>
                      <th className={TH}>Location</th>
                      <th className={TH}>Requested</th>
                      <th className={`${TH} text-right`}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {lists.pending.map((row) => {
                      const key = `app-${row.id}`;
                      return (
                        <Fragment key={row.id}>
                          <tr className="hover:bg-canvas/60">
                            <td className={TD}>
                              <WorkerCell
                                name={row.worker.name}
                                photoUrl={row.worker.photoUrl}
                                aadhaarVerified={row.worker.isAadhaarVerified}
                              />
                            </td>
                            <td className={`${TD} whitespace-nowrap tabular-nums text-ink-2`}>
                              <OrNotAdded value={row.worker.phone} />
                            </td>
                            <td className={`${TD} whitespace-nowrap tabular-nums text-ink-2`}>
                              <OrNotAdded value={maskAadhaar(row.worker.aadhaar)} />
                            </td>
                            <td className={TD}>
                              {row.worker.categories?.length > 0 ? (
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
                              <OrNotAdded value={[row.worker.city, row.worker.pincode].filter(Boolean).join(', ')} />
                            </td>
                            <td className={`${TD} whitespace-nowrap text-ink-2`}>{formatDate(row.requestedAt)}</td>
                            <td className={`${TD} text-right`}>
                              <div className="inline-flex gap-2">
                                <Button size="sm" onClick={() => accept(row)} disabled={busyKey === key}>
                                  <Check className="w-4 h-4" /> Accept
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => {
                                    setRejecting(row.id);
                                    setReason('');
                                  }}
                                  disabled={busyKey === key}
                                >
                                  <X className="w-4 h-4" /> Reject
                                </Button>
                              </div>
                            </td>
                          </tr>

                          {rejecting === row.id && (
                            <tr className="bg-canvas/60">
                              <td colSpan={7} className="px-5 py-4">
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
                                  <Button variant="danger" size="sm" onClick={() => reject(row)} disabled={busyKey === key}>
                                    Confirm reject
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="border-b border-line bg-canvas">
                    <tr>
                      <th className={TH}>Worker</th>
                      <th className={TH}>Mobile</th>
                      <th className={TH}>Aadhaar</th>
                      <th className={TH}>Added via</th>
                      <th className={TH}>Member since</th>
                      <th className={`${TH} text-right`}>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {members.map((member) => (
                      <tr key={member.key} className="hover:bg-canvas/60">
                        <td className={TD}>
                          <WorkerCell
                            name={member.name}
                            photoUrl={member.photoUrl}
                            aadhaarVerified={member.aadhaarVerified}
                          />
                        </td>
                        <td className={`${TD} whitespace-nowrap tabular-nums text-ink-2`}>
                          <OrNotAdded value={member.phone} />
                        </td>
                        <td className={`${TD} whitespace-nowrap tabular-nums text-ink-2`}>
                          <OrNotAdded value={maskAadhaar(member.aadhaar)} />
                        </td>
                        <td className={`${TD} whitespace-nowrap text-ink-2`}>
                          <OrNotAdded value={SOURCE_LABEL[member.source]} />
                        </td>
                        <td className={`${TD} whitespace-nowrap text-ink-2`}>{formatDate(member.since)}</td>
                        <td className={`${TD} text-right`}>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => remove(member)}
                            disabled={busyKey === member.key}
                          >
                            <UserMinus className="w-4 h-4" /> Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {dialog === 'add' && <AddWorkerDialog onClose={() => setDialog(null)} onAdded={handleAdded} />}
      {dialog === 'import' && <ImportWorkersDialog onClose={() => setDialog(null)} onImported={handleImported} />}
    </>
  );
}
