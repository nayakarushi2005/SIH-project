import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';
import { useAuth } from '../../context/AuthContext';
import { Award, Briefcase, Pause, Play, PlusCircle, ShieldCheck, Trash2, Users } from 'lucide-react';
import {
  Button,
  EmptyState,
  INPUT,
  LABEL,
  Loading,
  Modal,
  PageHeader,
  Panel,
  PanelHeader,
  StatusBadge,
  buttonClass,
} from '../../components/ui';

const TH = 'px-5 py-3 text-left text-xs font-medium text-ink-3';
const TD = 'px-5 py-3.5 align-middle';
const POLICY_FORM_ID = 'add-policy-form';

const POLICY_FIELDS = [
  { key: 'name', label: 'Policy name', placeholder: 'e.g. Gig Worker Health Secure', wide: true },
  { key: 'provider', label: 'Provider', placeholder: 'e.g. LIC' },
  { key: 'coverage', label: 'Coverage', placeholder: 'e.g. ₹5,00,000' },
  { key: 'premium', label: 'Premium', placeholder: 'e.g. ₹400/year' },
  { key: 'paperwork', label: 'Paperwork', placeholder: 'e.g. Aadhaar only' },
];

const APPLICATION_BADGE = {
  pending: { status: 'pending', label: 'Pending' },
  approved: { status: 'verified', label: 'Verified' },
  rejected: { status: 'rejected', label: 'Rejected' },
};

function StatCard({ label, value, icon: Icon }) {
  return (
    <Panel className="flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-xs font-medium text-ink-3">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      </div>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon className="w-5 h-5" />
      </span>
    </Panel>
  );
}

function PolicyRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-3">{label}</span>
      <span className="font-medium text-ink">{children}</span>
    </div>
  );
}

export default function FederationDashboard() {
  const authFetch = useFetchWithAuth();
  const { user } = useAuth();
  
  const [federation, setFederation] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);
  const [applications, setApplications] = useState([]);
  const [loadingApps, setLoadingApps] = useState(true);

  // New policy state
  const [showAddPolicyModal, setShowAddPolicyModal] = useState(false);
  const [newPolicy, setNewPolicy] = useState({
    name: '', provider: '', coverage: '', premium: '', interest: '0%', paperwork: 'Minimal'
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user?.email) return;
      try {
        const res = await authFetch(`/api/federation/check-email/${encodeURIComponent(user.email)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.exists && data.federation) {
            setFederation(data.federation);
            setMemberCount(data.memberCount || 0);
          }
        }
      } catch (err) {
        console.error('Failed to fetch federation', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, [user?.email, authFetch]);

  useEffect(() => {
    const fetchInsurancePackages = async () => {
      try {
        const res = await authFetch('/api/federation/me/insurance');
        if (res.ok) {
          const data = await res.json();
          setPackages(data.packages || []);
        }
      } catch (err) {
        console.error('Failed to fetch insurance packages', err);
      } finally {
        setLoadingPackages(false);
      }
    };

    fetchInsurancePackages();
  }, [authFetch]);

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        const res = await authFetch('/api/federation/me/insurance-applications');
        if (res.ok) {
          const data = await res.json();
          setApplications(data.applications || []);
        }
      } catch (err) {
        console.error('Failed to fetch insurance applications', err);
      } finally {
        setLoadingApps(false);
      }
    };

    fetchApplications();
  }, [authFetch]);

  const handleVerifyApplication = async (appId, action) => {
    try {
      const res = await authFetch(`/api/federation/me/insurance-applications/${appId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        setApplications(prev => prev.map(a => a._id === appId ? { ...a, status: action === 'approve' ? 'approved' : 'rejected' } : a));
      }
    } catch (error) {
      console.error(error);
      alert('Failed to update application.');
    }
  };

  const handleAddPolicy = async (e) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/federation/me/insurance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPolicy)
      });
      if (res.ok) {
        const data = await res.json();
        setPackages([data.package, ...packages]);
        setShowAddPolicyModal(false);
        setNewPolicy({ name: '', provider: '', coverage: '', premium: '', interest: '0%', paperwork: 'Minimal' });
      } else {
        alert('Failed to add policy');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to add policy');
    }
  };

  const handleUpdatePolicyStatus = async (id, status) => {
    try {
      const res = await authFetch(`/api/federation/me/insurance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        setPackages(prev => prev.map(p => p._id === id ? { ...p, status } : p));
      } else {
        alert('Failed to update policy status');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update policy status');
    }
  };




  const optedMembers = (pkg) => applications.filter((a) => a.packageId === pkg._id && a.status === 'approved').length;
  const currentPolicies = packages.filter((p) => p.status !== 'deprecated');
  const deprecatedPolicies = packages.filter((p) => p.status === 'deprecated');

  if (loading) {
    return (
      <Panel>
        <Loading label="Loading dashboard" />
      </Panel>
    );
  }

  if (!federation || federation.status !== 'verified') {
    return (
      <Panel>
        <EmptyState icon={ShieldCheck} title="Only verified federations can open the dashboard">
          <Link to="/federation/status" className="font-medium text-accent hover:underline">
            Check your verification status
          </Link>
        </EmptyState>
      </Panel>
    );
  }

  return (
    <>
      <PageHeader
        title={`Welcome, ${federation.name}`}
        description="Manage your workers and offer insurance with minimal paperwork to keep your members secure."
        actions={
          <Link to="/federation/workers" className={buttonClass('secondary')}>
            <Users className="w-4 h-4" /> Manage workers
          </Link>
        }
      />

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total workers" value={memberCount} icon={Users} />
          <StatCard label="Applications" value={applications.length} icon={ShieldCheck} />
          <StatCard label="Active offers" value={packages.length} icon={Briefcase} />
        </div>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Insurance collaboration"
            description="Curated insurance packages for your gig workers, with minimal paperwork and government verification."
            actions={
              <Button size="sm" onClick={() => setShowAddPolicyModal(true)}>
                <PlusCircle className="w-4 h-4" /> Add policy
              </Button>
            }
          />

          {loadingPackages ? (
            <Loading label="Loading policies" />
          ) : packages.length === 0 ? (
            <EmptyState icon={Award} title="No insurance packages yet">
              Add a policy to offer it to your members.
            </EmptyState>
          ) : (
            <div className="space-y-6 px-5 py-5">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-ink">Active and paused policies</h3>
                {currentPolicies.length === 0 ? (
                  <p className="text-sm text-ink-3">No active policies.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {currentPolicies.map((pkg) => (
                      <div key={pkg._id} className="flex flex-col rounded-lg border border-line bg-surface p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-accent">
                            <Award className="w-[18px] h-[18px]" />
                          </span>
                          <div className="flex flex-col items-end gap-1">
                            <span className="rounded border border-line bg-canvas px-1.5 py-0.5 text-xs text-ink-2">{pkg.provider}</span>
                            <span className="font-mono text-[11px] text-ink-3">{pkg.policyId}</span>
                          </div>
                        </div>

                        <h4 className="mb-3 text-base font-semibold text-ink">{pkg.name}</h4>

                        <div className="mb-4 flex-1 space-y-2">
                          <PolicyRow label="Coverage">{pkg.coverage}</PolicyRow>
                          <PolicyRow label="Premium">{pkg.premium}</PolicyRow>
                          <PolicyRow label="Status">
                            <StatusBadge
                              status={pkg.status === 'paused' ? 'pending' : 'verified'}
                              label={pkg.status === 'paused' ? 'Paused' : 'Active'}
                            />
                          </PolicyRow>
                          <div className="border-t border-line pt-2">
                            <PolicyRow label="Opted members">{optedMembers(pkg)}</PolicyRow>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {pkg.status === 'active' ? (
                            <Button variant="secondary" size="sm" onClick={() => handleUpdatePolicyStatus(pkg._id, 'paused')}>
                              <Pause className="w-4 h-4" /> Hold
                            </Button>
                          ) : (
                            <Button variant="secondary" size="sm" onClick={() => handleUpdatePolicyStatus(pkg._id, 'active')}>
                              <Play className="w-4 h-4" /> Resume
                            </Button>
                          )}
                          <Button variant="danger" size="sm" onClick={() => handleUpdatePolicyStatus(pkg._id, 'deprecated')}>
                            <Trash2 className="w-4 h-4" /> Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {deprecatedPolicies.length > 0 && (
                <div className="border-t border-line pt-6">
                  <h3 className="mb-3 text-sm font-semibold text-ink-2">Deprecated policies</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {deprecatedPolicies.map((pkg) => (
                      <div key={pkg._id} className="flex flex-col rounded-lg border border-line bg-canvas p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-ink-3">{pkg.provider}</span>
                          <span className="font-mono text-[11px] text-ink-3">{pkg.policyId}</span>
                        </div>
                        <h4 className="mb-2 text-sm font-semibold text-ink-2">{pkg.name}</h4>
                        <p className="mb-3 text-xs text-ink-3">
                          Legacy members supported: <span className="font-medium text-ink-2">{optedMembers(pkg)}</span>
                        </p>
                        <span className="mt-auto inline-flex h-6 w-fit items-center rounded bg-surface px-2 text-xs font-medium text-ink-3 border border-line">
                          Removed
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader
            title="Insured members"
            description="Gig workers in your federation who applied for an insurance policy."
          />
          {loadingApps ? (
            <Loading label="Loading members" />
          ) : applications.length === 0 ? (
            <EmptyState icon={Users} title="No members have opted for insurance yet" />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-line bg-canvas">
                  <tr>
                    <th className={TH}>Worker</th>
                    <th className={TH}>Location</th>
                    <th className={TH}>Package</th>
                    <th className={TH}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {applications.map((app) => {
                    const badge = APPLICATION_BADGE[app.status];
                    return (
                      <tr key={app._id} className="hover:bg-canvas/60">
                        <td className={`${TD} font-medium text-ink`}>{app.workerId?.name || 'Unknown worker'}</td>
                        <td className={`${TD} text-ink-2`}>
                          {[app.workerId?.city, app.workerId?.pincode].filter(Boolean).join(', ') || 'Not added'}
                        </td>
                        <td className={`${TD} text-ink-2`}>{app.packageName}</td>
                        <td className={TD}>{badge ? <StatusBadge status={badge.status} label={badge.label} /> : <StatusBadge status={app.status} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Modal
        open={showAddPolicyModal}
        onClose={() => setShowAddPolicyModal(false)}
        title="Add insurance policy"
        description="The policy is published to your members once saved."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddPolicyModal(false)}>
              Cancel
            </Button>
            <Button type="submit" form={POLICY_FORM_ID}>
              Save and publish
            </Button>
          </>
        }
      >
        <form id={POLICY_FORM_ID} onSubmit={handleAddPolicy} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {POLICY_FIELDS.map(({ key, label, placeholder, wide }) => (
            <div key={key} className={wide ? 'sm:col-span-2' : ''}>
              <label htmlFor={`policy-${key}`} className={LABEL}>
                {label}
              </label>
              <input
                id={`policy-${key}`}
                type="text"
                required
                value={newPolicy[key]}
                onChange={(e) => setNewPolicy({ ...newPolicy, [key]: e.target.value })}
                placeholder={placeholder}
                className={INPUT}
              />
            </div>
          ))}
        </form>
      </Modal>
    </>
  );
}
