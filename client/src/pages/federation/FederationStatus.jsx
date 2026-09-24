import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { getAllFederationsApi, checkFederationByEmailApi } from '../../services/api';
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
  Sparkles
} from 'lucide-react';

export default function FederationStatus() {
  const location = useLocation();
  const initialFederation = location.state?.federation || null;

  const [federation, setFederation] = useState(initialFederation);
  const [searchEmail, setSearchEmail] = useState(initialFederation?.email || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLookup = async (e) => {
    if (e) e.preventDefault();
    if (!searchEmail.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await checkFederationByEmailApi(searchEmail.trim());

      if (data.exists && data.federation) {
        setFederation(data.federation);
      } else {
        // Fallback check all
        const allData = await getAllFederationsApi();
        const match = allData.federations?.find(
          (f) =>
            f.fedId.toLowerCase() === searchEmail.trim().toLowerCase() ||
            f.email.toLowerCase() === searchEmail.trim().toLowerCase()
        );

        if (!match) {
          throw new Error('No registered federation found matching this Email or Fed ID.');
        }
        setFederation(match);
      }
    } catch (err) {
      setError(err.message || 'Federation not found');
      setFederation(null);
    } finally {
      setLoading(false);
    }
  };

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

        {/* Lookup Bar */}
        <form onSubmit={handleLookup} className="mb-8 bg-slate-900 p-2.5 rounded-2xl border border-slate-800 flex gap-2 shadow-xl">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Enter Email or Fed ID..."
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-slate-500"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Check Status'}
          </button>
        </form>

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
                <span className="text-xs font-semibold text-slate-400 uppercase">Fund Amount:</span>
                <span className="text-sm font-bold text-emerald-400 flex items-center gap-1">
                  <IndianRupee className="w-3.5 h-3.5" /> ₹{federation.amount?.toLocaleString()}
                </span>
              </div>
            </div>
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
