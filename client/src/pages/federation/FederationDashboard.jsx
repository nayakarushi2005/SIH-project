import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';
import { useAuth } from '../../context/AuthContext';
import { 
  Building2, 
  Users, 
  ShieldCheck, 
  ArrowRight,
  ShieldPlus,
  Activity,
  Award,
  CheckCircle2,
  Clock,
  Briefcase
} from 'lucide-react';

export default function FederationDashboard() {
  const authFetch = useFetchWithAuth();
  const { user } = useAuth();
  
  const [federation, setFederation] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const [loadingPackages, setLoadingPackages] = useState(true);

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

  const handleApply = async (pkgId) => {
    try {
      const res = await authFetch(`/api/federation/me/insurance/${pkgId}/apply`, {
        method: 'POST'
      });
      if (res.ok) {
        alert('Insurance applied successfully for your workers!');
      }
    } catch (error) {
      console.error(error);
      alert('Failed to apply insurance.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!federation || federation.status !== 'verified') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8">
        <ShieldCheck className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
        <p className="text-slate-400">Only verified federations can access this dashboard.</p>
        <Link to="/federation/status" className="mt-6 text-blue-400 hover:underline">
          Check your verification status
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold uppercase tracking-wider mb-3">
              <Activity className="w-4 h-4" /> Federation Portal
            </div>
            <h1 className="text-3xl font-extrabold sm:text-4xl">
              Welcome, <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">{federation.name}</span>
            </h1>
            <p className="text-slate-400 mt-2 text-sm max-w-2xl">
              Manage your workforce and explore zero-paperwork insurance collaborations to secure your community.
            </p>
          </div>
          
          <div className="flex gap-3">
            <Link
              to="/federation/workers"
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl text-sm transition-all border border-slate-700 flex items-center gap-2"
            >
              <Users className="w-4 h-4" /> Manage Workers
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-lg relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Workers</p>
                <h3 className="text-3xl font-bold text-white">{memberCount}</h3>
              </div>
              <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center border border-blue-500/20">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-lg relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Insured Members</p>
                <h3 className="text-3xl font-bold text-white">0</h3>
              </div>
              <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-lg relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex items-center justify-between relative z-10">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Active Offers</p>
                <h3 className="text-3xl font-bold text-white">{packages.length}</h3>
              </div>
              <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center border border-indigo-500/20">
                <Briefcase className="w-6 h-6 text-indigo-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Insurance Collaboration Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          
          <div className="relative z-10 mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <ShieldPlus className="w-7 h-7 text-emerald-400" />
              Insurance Collaboration
            </h2>
            <p className="text-slate-400 text-sm mt-2 max-w-3xl">
              Provide social security to your gig workers with curated insurance packages. 
              Minimal paperwork, verified by government, and specialized for unorganized sectors.
            </p>
          </div>

          {loadingPackages ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : packages.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              No insurance packages available at the moment.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
              {packages.map(pkg => (
                <div key={pkg.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-6 hover:border-emerald-500/50 transition-all group flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center border border-slate-800">
                      <Award className="w-5 h-5 text-emerald-400" />
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                      {pkg.provider}
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-bold text-white mb-2">{pkg.name}</h3>
                  
                  <div className="space-y-3 mb-6 flex-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Coverage:</span>
                      <span className="font-bold text-white">{pkg.coverage}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Premium:</span>
                      <span className="font-bold text-white">{pkg.premium}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Interest:</span>
                      <span className="font-bold text-emerald-400">{pkg.interest}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Paperwork:</span>
                      <span className="font-semibold text-slate-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {pkg.paperwork}
                      </span>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleApply(pkg.id)}
                    className="w-full py-2.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white font-bold rounded-xl text-sm transition-all border border-emerald-500/20 group-hover:border-transparent flex justify-center items-center gap-2"
                  >
                    Apply for Workers <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
