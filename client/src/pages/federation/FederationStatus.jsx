import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';
import { useAuth } from '../../context/AuthContext';
import CityPinFields from '../../components/CityPinFields';
import { Building2, Pencil } from 'lucide-react';
import { Button, Notice, PageHeader, Panel, PanelHeader, StatusBadge, Loading, EmptyState, buttonClass } from '../../components/ui';

function Detail({ label, children, className = '' }) {
  return (
    <div className={`bg-surface px-5 py-4 ${className}`}>
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

function statusMessage(federation) {
  if (federation.status === 'verified') {
    return `Verified by a government official on ${new Date(federation.verifiedAt || federation.updatedAt).toLocaleDateString()}.`;
  }
  if (federation.status === 'rejected') {
    return federation.rejectionReason || 'Application rejected during government review.';
  }
  return 'Registration saved. Waiting for review by a government official.';
}

export default function FederationStatus() {
  const location = useLocation();
  const authFetch = useFetchWithAuth();
  const { user } = useAuth();
  
  const initialFederation = location.state?.federation || null;

  const [federation, setFederation] = useState(initialFederation);
  const [memberCount, setMemberCount] = useState(null);
  const [loading, setLoading] = useState(!initialFederation);
  const [error, setError] = useState(null);

  const fetchMyStatus = async () => {
    if (!user?.email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/federation/check-email/${encodeURIComponent(user.email)}`);
      if (!res.ok) throw new Error('Federation not found');
      const data = await res.json();
      
      if (data.exists && data.federation) {
        setFederation(data.federation);
        setMemberCount(data.memberCount ?? null);
      } else {
        throw new Error('No registered federation found for your account.');
      }
    } catch (err) {
      setError(err.message || 'Federation not found');
      setFederation(null);
    } finally {
      setLoading(false);
    }
  };

  const [editingLocation, setEditingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState({ city: '', pincode: '' });
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState(null);

  const startEditingLocation = () => {
    setLocationDraft({ city: federation.city || '', pincode: federation.pincode || '' });
    setLocationError(null);
    setEditingLocation(true);
  };

  const saveLocation = async (e) => {
    e.preventDefault();
    setSavingLocation(true);
    setLocationError(null);
    try {
      const res = await authFetch('/api/federation/me/location', {
        method: 'PATCH',
        body: JSON.stringify({ city: locationDraft.city.trim(), pincode: locationDraft.pincode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.fields?.city || data.fields?.pincode || data.message || 'Could not save location');
      setFederation(data.federation);
      setEditingLocation(false);
    } catch (err) {
      setLocationError(err.message || 'Could not save location');
    } finally {
      setSavingLocation(false);
    }
  };

  // Always refresh on open: status and connected-worker count change over time.
  useEffect(() => {
    if (user?.email) {
      fetchMyStatus();
    }
  }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader
        title={federation?.name || 'Federation status'}
        description="Verification status and details for your federation."
        actions={
          federation?.status === 'verified' && (
            <Link to="/federation/dashboard" className={buttonClass('primary')}>
              Go to Federation Dashboard
            </Link>
          )
        }
      />

      {error && <Notice className="mb-6">{error}</Notice>}

      {federation ? (
        <div className="space-y-6">
          <Panel className="flex flex-col items-start gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <StatusBadge status={federation.status} />
            <p className={`text-sm ${federation.status === 'rejected' ? 'text-bad' : 'text-ink-2'}`}>
              {statusMessage(federation)}
            </p>
            {federation.status === 'rejected' && (
              <Link to="/federation/register" className={`${buttonClass('secondary', 'sm')} sm:ml-auto`}>
                Fix and resubmit
              </Link>
            )}
          </Panel>

          <Panel className="overflow-hidden">
            <PanelHeader title="Details" />
            <dl className="grid gap-px bg-line sm:grid-cols-2">
              <Detail label="Federation ID">
                <span className="font-mono text-[13px]">{federation.fedId}</span>
              </Detail>
              <Detail label="Official email">{federation.email}</Detail>
              <Detail label="Registered workers">{memberCount ?? 'Not available'}</Detail>
              <Detail label="Fund amount">₹{federation.amount?.toLocaleString()}</Detail>
              <Detail label="City and PIN code" className="sm:col-span-2">
                {editingLocation ? (
                  <span className="text-ink-3">Editing below</span>
                ) : (
                  <span className="flex items-center justify-between gap-3">
                    {federation.city || federation.pincode ? (
                      [federation.city, federation.pincode].filter(Boolean).join(', ')
                    ) : (
                      <span className="text-warn">Not added. Workers can&apos;t find you.</span>
                    )}
                    <Button variant="ghost" size="sm" onClick={startEditingLocation}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                  </span>
                )}
              </Detail>
            </dl>

            {editingLocation && (
              <form onSubmit={saveLocation} className="space-y-4 border-t border-line px-5 py-5">
                <CityPinFields
                  city={locationDraft.city}
                  pincode={locationDraft.pincode}
                  onChange={(loc) => setLocationDraft((prev) => ({ ...prev, ...loc }))}
                  autoDetect={!federation.city && !federation.pincode}
                />
                {locationError && <Notice>{locationError}</Notice>}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setEditingLocation(false)} disabled={savingLocation}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={savingLocation}>
                    {savingLocation ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </form>
            )}
          </Panel>
        </div>
      ) : loading ? (
        <Panel>
          <Loading label="Loading status" />
        </Panel>
      ) : (
        <Panel>
          <EmptyState icon={Building2} title="No registered federation found">
            If you haven&apos;t registered yet,{' '}
            <Link to="/federation/register" className="font-medium text-accent hover:underline">
              fill in the registration form
            </Link>
            .
          </EmptyState>
        </Panel>
      )}
    </>
  );
}
