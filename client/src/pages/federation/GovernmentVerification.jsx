import { useState, useEffect } from 'react';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';
import { Ban, Building2, CircleCheck, Search, RefreshCw, Check, X } from 'lucide-react';
import { Button, EmptyState, INPUT, Loading, Notice, PageHeader, Panel, StatusBadge, Tabs } from '../../components/ui';

const TH = 'px-5 py-3 text-left text-xs font-medium text-ink-3';
const TD = 'px-5 py-3.5 align-middle';

export default function GovernmentVerification() {
  const authFetch = useFetchWithAuth();
  
  const [federations, setFederations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Default to 'unverified' as per handwritten note: "Info of all unverified federations shown on a page"
  const [filterStatus, setFilterStatus] = useState('unverified');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [lastVerifiedFed, setLastVerifiedFed] = useState(null);

  const fetchFederations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/federation/all');
      if (!res.ok) throw new Error('Failed to fetch federations');
      const data = await res.json();
      setFederations(data.federations || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch federations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFederations();
  }, []);

  const handleVerification = async (id, status, rejectionReason) => {
    setActionLoadingId(id);
    try {
      const res = await authFetch(`/api/federation/${id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status, rejectionReason })
      });
      if (!res.ok) throw new Error('Failed to update status');
      const data = await res.json();

      // Update local state instantly so UI matches DB state!
      setFederations((prev) =>
        prev.map((f) => (f._id === id ? { ...f, ...data.federation } : f))
      );

      if (status === 'verified') {
        setLastVerifiedFed(data.federation);
      }
    } catch (err) {
      alert(`Error updating status: ${err.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeregister = (fed) => {
    if (!window.confirm(`Deregister ${fed.name}? It will lose its verified status and can no longer manage workers.`)) return;
    handleVerification(fed._id, 'rejected', 'Deregistered by a government official.');
  };

  // Filter federations based on status & search
  const filteredFederations = federations.filter((fed) => {
    const matchesStatus = filterStatus === 'all' || fed.status === filterStatus;
    const matchesSearch =
      fed.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fed.fedId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      fed.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const unverifiedCount = federations.filter((f) => f.status === 'unverified').length;
  const verifiedCount = federations.filter((f) => f.status === 'verified').length;

  return (
    <>
      <PageHeader
        title="Federation verification"
        description="Review registered federations. Verifying one lets it start accepting workers."
        actions={
          <Button variant="secondary" onClick={fetchFederations} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        }
      />

      {lastVerifiedFed && (
        <Notice tone="ok" icon={CircleCheck} onDismiss={() => setLastVerifiedFed(null)} className="mb-6">
          <span className="font-medium">{lastVerifiedFed.name}</span> ({lastVerifiedFed.fedId}) is now verified.
        </Notice>
      )}

      {error && <Notice className="mb-6">{error}</Notice>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={filterStatus}
          onChange={setFilterStatus}
          items={[
            { key: 'unverified', label: `Unverified (${unverifiedCount})` },
            { key: 'verified', label: `Verified (${verifiedCount})` },
            { key: 'all', label: 'All' },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <input
            type="search"
            aria-label="Search federations"
            placeholder="Search by name, ID or email"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`${INPUT} h-9 pl-9`}
          />
          <Search className="w-4 h-4 text-ink-3 absolute left-3 top-2.5 pointer-events-none" />
        </div>
      </div>

      <Panel className="overflow-hidden">
        {loading ? (
          <Loading label="Loading federations" />
        ) : filteredFederations.length === 0 ? (
          <EmptyState icon={Building2} title={`No ${filterStatus === 'all' ? '' : `${filterStatus} `}federations found`}>
            {searchQuery ? 'Try a different search.' : 'Nothing is waiting for review right now.'}
          </EmptyState>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line bg-canvas">
                <tr>
                  <th className={TH}>Federation</th>
                  <th className={TH}>Federation ID</th>
                  <th className={TH}>Workers</th>
                  <th className={TH}>Grant</th>
                  <th className={TH}>Status</th>
                  <th className={`${TH} text-right`}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredFederations.map((fed) => (
                  <tr key={fed._id} className="hover:bg-canvas/60">
                    <td className={TD}>
                      <p className="font-medium text-ink">{fed.name}</p>
                      <p className="text-xs text-ink-3">{fed.email}</p>
                    </td>
                    <td className={`${TD} font-mono text-[13px] text-ink-2`}>{fed.fedId}</td>
                    <td className={`${TD} text-ink-2`}>{fed.memberCount ?? 0}</td>
                    <td className={`${TD} text-ink-2`}>₹{fed.amount?.toLocaleString()}</td>
                    <td className={TD}>
                      <StatusBadge status={fed.status} />
                    </td>
                    <td className={`${TD} text-right`}>
                      {fed.status === 'verified' && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeregister(fed)}
                          disabled={actionLoadingId === fed._id}
                        >
                          <Ban className="w-4 h-4" /> Deregister
                        </Button>
                      )}
                      {fed.status !== 'verified' && (
                        <div className="inline-flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleVerification(fed._id, 'verified')}
                            disabled={actionLoadingId === fed._id}
                          >
                            <Check className="w-4 h-4" /> Verify
                          </Button>
                          {fed.status !== 'rejected' && (
                            <Button
                              variant="danger"
                              size="icon"
                              onClick={() => handleVerification(fed._id, 'rejected')}
                              disabled={actionLoadingId === fed._id}
                              title="Reject"
                              aria-label={`Reject ${fed.name}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
