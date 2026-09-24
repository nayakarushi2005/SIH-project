import { useState, useEffect } from 'react';
import { getAllFederationsApi, verifyFederationApi } from '../../services/api';
import { 
  Building2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search, 
  RefreshCw, 
  Users, 
  ShieldAlert, 
  Check, 
  X,
  Mail,
  CheckCheck
} from 'lucide-react';

export default function GovernmentVerification() {
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
      const data = await getAllFederationsApi();
      setFederations(data.federations || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch federations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFederations();
  }, []);

  const handleVerification = async (id, status) => {
    setActionLoadingId(id);
    try {
      const data = await verifyFederationApi(id, status);

      // Update local state instantly so UI matches DB state!
      setFederations((prev) =>
        prev.map((f) => (f._id === id ? data.federation : f))
      );

      if (status === 'verified') {
        setLastVerifiedFed(data.federation);
      }
    } catch (err) {
      alert(`Error updating status: ${err.response?.data?.message || err.message}`);
    } finally {
      setActionLoadingId(null);
    }
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
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2 border border-emerald-500/20">
              <ShieldAlert className="w-3.5 h-3.5" /> Government Verification Portal
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Govt <span className="text-emerald-400">Federation Verification</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Review info of all unverified federations. Clicking <span className="text-emerald-400 font-semibold">Verify</span> changes database status to verified.
            </p>
          </div>
          <button
            onClick={fetchFederations}
            disabled={loading}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 border border-slate-800 self-start md:self-auto shadow-md"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Verification Success Toast / Banner */}
        {lastVerifiedFed && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex justify-between items-center text-emerald-300 text-sm animate-fadeIn">
            <div className="flex items-center gap-3">
              <CheckCheck className="w-6 h-6 text-emerald-400" />
              <div>
                <span className="font-bold text-white">{lastVerifiedFed.name} ({lastVerifiedFed.fedId})</span> status changed in DB to <strong className="uppercase">Verified</strong>!
              </div>
            </div>
            <button
              onClick={() => setLastVerifiedFed(null)}
              className="text-xs text-slate-400 hover:text-white underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
          {/* Status Filter Tabs */}
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
            <button
              onClick={() => setFilterStatus('unverified')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filterStatus === 'unverified'
                  ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Unverified Requests ({unverifiedCount})
            </button>
            <button
              onClick={() => setFilterStatus('verified')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filterStatus === 'verified'
                  ? 'bg-emerald-600 text-white font-extrabold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Verified ({verifiedCount})
            </button>
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                filterStatus === 'all'
                  ? 'bg-blue-600 text-white font-extrabold shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search Fed ID, Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          </div>
        </div>

        {/* List of Federations (Matching Diagram Box: Fed 1 -> info [Verify]) */}
        {loading ? (
          <div className="bg-slate-900 rounded-2xl p-12 text-center text-slate-400 border border-slate-800">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-400" />
            Loading federation requests...
          </div>
        ) : filteredFederations.length === 0 ? (
          <div className="bg-slate-900 rounded-2xl p-12 text-center text-slate-400 border border-slate-800">
            <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-lg font-semibold text-slate-300">No {filterStatus === 'unverified' ? 'Unverified' : ''} Federations Found</p>
            <p className="text-sm text-slate-500 mt-1">All federation requests are up to date.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredFederations.map((fed) => (
              <div
                key={fed._id}
                className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-slate-700 transition-all"
              >
                {/* Info Section (Matching Fed -> info diagram) */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-md">
                      {fed.fedId}
                    </span>
                    <h3 className="text-xl font-bold text-white">{fed.name}</h3>
                    {fed.status === 'unverified' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Clock className="w-3 h-3" /> Unverified
                      </span>
                    )}
                    {fed.status === 'verified' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" /> Verified
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400 pt-1">
                    <div className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      <span>{fed.email}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-slate-200 font-semibold">{fed.noOfWorkers} Workers</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400 font-bold">₹{fed.amount?.toLocaleString()} Grant</span>
                    </div>
                  </div>
                </div>

                {/* Verify Action Button (Matching [Verify] button in diagram) */}
                <div className="flex items-center gap-3 self-end md:self-auto">
                  {fed.status !== 'verified' ? (
                    <button
                      onClick={() => handleVerification(fed._id, 'verified')}
                      disabled={actionLoadingId === fed._id}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" /> Verify Federation
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl">
                      <CheckCircle2 className="w-4 h-4" /> Verified in Database
                    </div>
                  )}

                  {fed.status !== 'rejected' && fed.status !== 'verified' && (
                    <button
                      onClick={() => handleVerification(fed._id, 'rejected')}
                      disabled={actionLoadingId === fed._id}
                      className="p-2.5 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-700"
                      title="Reject"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
