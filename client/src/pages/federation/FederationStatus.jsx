import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';
import { useAuth } from '../../context/AuthContext';
import CityPinFields from '../../components/CityPinFields';
import { 
  Building2, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Search, 
  RefreshCw, 
  ArrowLeft,
  Mail,
  Users,
  IndianRupee,
  Pencil,
  Sparkles
} from 'lucide-react';

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
    <div className="min-h-screen bg-slate-950 text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Navigation back */}
        <div className="mb-6 flex justify-between items-center">
          <Link
            to="/federation/register"
            className="text-slate-400 hover:text-white text-sm font-semibold flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Registration Form
          </Link>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Verification Status Screen
          </div>
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">
            Federation <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Status Portal</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            View live status for registered federations in database.
          </p>
        </div>

        {/* Lookup Bar Removed - Status is automatically fetched using logged-in user email */}

        {error && (
          <div className="p-4 mb-6 bg-rose-500/10 text-rose-400 rounded-2xl border border-rose-500/20 text-sm font-medium text-center">
            ⚠️ {error}
          </div>
        )}

        {/* Status Display Card */}
        {federation ? (
          <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-2xl space-y-6 animate-fadeIn">
            {/* Status Hero Badge */}
            <div className="text-center pb-6 border-b border-slate-800">
              {federation.status === 'unverified' && (
                <div className="inline-flex flex-col items-center">
                  <div className="w-16 h-16 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mb-3 border border-amber-500/20">
                    <Clock className="w-9 h-9 animate-pulse" />
                  </div>
                  <span className="px-4 py-1.5 rounded-full text-sm font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 mb-2">
                    UNVERIFIED
                  </span>
                  <p className="text-xs text-slate-400 max-w-sm">
                    Registration saved in database. Pending manual review by a Government Official.
                  </p>
                </div>
              )}

              {federation.status === 'verified' && (
                <div className="inline-flex flex-col items-center">
                  <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mb-3 border border-emerald-500/20">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <span className="px-4 py-1.5 rounded-full text-sm font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-2">
                    VERIFIED ✅
                  </span>
                  <p className="text-xs text-emerald-400 font-semibold max-w-sm">
                    Verified by Government Official on {new Date(federation.verifiedAt || federation.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              )}

              {federation.status === 'rejected' && (
                <div className="inline-flex flex-col items-center">
                  <div className="w-16 h-16 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mb-3 border border-rose-500/20">
                    <XCircle className="w-9 h-9" />
                  </div>
                  <span className="px-4 py-1.5 rounded-full text-sm font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 mb-2">
                    REJECTED
                  </span>
                  <p className="text-xs text-rose-400 max-w-sm">
                    {federation.rejectionReason || 'Application rejected during government review.'}
                  </p>
                </div>
              )}
            </div>

            {/* Federation Summary */}
            <div className="bg-slate-950/80 rounded-2xl p-6 border border-slate-800 space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                <span className="text-xs font-semibold text-slate-400 uppercase">Fed ID:</span>
                <span className="text-sm font-mono font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-lg">
                  {federation.fedId}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-400 uppercase">Federation Name:</span>
                <span className="text-sm font-bold text-white">{federation.name}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-400 uppercase">Official Email:</span>
                <span className="text-sm text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-500" /> {federation.email}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-400 uppercase">Number of Workers:</span>
                <span className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-500" /> {federation.noOfWorkers} Workers
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-400 uppercase">Connected Workers:</span>
                <span className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> {memberCount ?? '—'}
                </span>
              </div>

              {editingLocation ? (
                <form onSubmit={saveLocation} className="space-y-3 pt-1">
                  <span className="text-xs font-semibold text-slate-400 uppercase">City / PIN:</span>
                  <CityPinFields
                    city={locationDraft.city}
                    pincode={locationDraft.pincode}
                    onChange={(loc) => setLocationDraft((prev) => ({ ...prev, ...loc }))}
                    autoDetect={!federation.city && !federation.pincode}
                  />
                  {locationError && <p className="text-xs text-rose-400">{locationError}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingLocation(false)}
                      disabled={savingLocation}
                      className="px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-xl text-sm font-bold disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingLocation}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                    >
                      {savingLocation ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex justify-between items-center gap-3">
                  <span className="text-xs font-semibold text-slate-400 uppercase">City / PIN:</span>
                  <span className="text-sm text-slate-300 flex items-center gap-3">
                    {federation.city || federation.pincode ? (
                      [federation.city, federation.pincode].filter(Boolean).join(' · ')
                    ) : (
                      <span className="text-amber-400">Not added — workers can&apos;t find you</span>
                    )}
                    <button
                      type="button"
                      onClick={startEditingLocation}
                      className="text-blue-400 hover:text-blue-300 text-xs font-bold flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-400 uppercase">Fund Amount:</span>
                <span className="text-sm font-bold text-emerald-400 flex items-center gap-1">
                  <IndianRupee className="w-3.5 h-3.5" /> ₹{federation.amount?.toLocaleString()}
                </span>
              </div>
            </div>

            {federation.status === 'verified' && (
              <Link
                to="/federation/workers"
                className="block w-full text-center px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-blue-500/25"
              >
                Manage worker requests →
              </Link>
            )}
          </div>
        ) : (
          !loading && (
            <div className="bg-slate-900 rounded-3xl p-10 text-center border border-slate-800">
              <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-base font-semibold text-slate-300">Enter your email above to check status</p>
              <p className="text-xs text-slate-500 mt-1">If not registered yet, fill in the registration form first.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
