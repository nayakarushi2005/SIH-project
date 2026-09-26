import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useFetchWithAuth from '../../hooks/useFetchWithAuth';
import { useAuth } from '../../context/AuthContext';
import { 
  Building2, 
  Users, 
  Mail, 
  IndianRupee, 
  MapPin,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Search,
  RefreshCw
} from 'lucide-react';

export default function FederationRegister() {
  const navigate = useNavigate();
  const location = useLocation();
  const authFetch = useFetchWithAuth();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: user?.name || location.state?.user?.name || '',
    email: user?.email || location.state?.user?.email || '',
    area: '',
    city: '',
    pincode: '',
    amount: '',
    noOfWorkers: '',
  });

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: prev.name || user.name,
        email: prev.email || user.email
      }));
    }
  }, [user]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name } = e.target;
    const value = name === 'pincode' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await authFetch('/api/federation/register', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          amount: Number(formData.amount) || 0,
          noOfWorkers: Number(formData.noOfWorkers) || 0,
          area: formData.area,
          city: formData.city.trim(),
          pincode: formData.pincode,
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.fields?.pincode || data.fields?.city || data.message || 'Failed to submit registration');
      }

      // Save details in DB -> Directly redirect to Federation Status page
      navigate('/federation/status', {
        state: { federation: data.federation },
      });
    } catch (err) {
      setError(err.message || 'Failed to submit registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto space-y-8">
        {/* Header Title */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles className="w-4 h-4" /> Federation Portal
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-white">
            Federation <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">Registration</span>
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            First time logging in? Fill in your details below. If already registered, enter your email to view your status.
          </p>
        </div>

        {/* Removed Manual Email Check Form as we are properly authenticated */}

        {/* Main Registration Form */}
        <form onSubmit={handleSubmit} className="bg-slate-900 rounded-3xl p-8 shadow-2xl border border-slate-800 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-400" /> Federation Details Form
            </h2>
            <span className="text-xs text-slate-500">First Time Registration</span>
          </div>

          {error && (
            <div className="p-4 bg-rose-500/10 text-rose-400 rounded-2xl border border-rose-500/20 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Fed Name *
            </label>
            <div className="relative">
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter Federation Name"
                className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm"
              />
              <Building2 className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Fed Area / Region
            </label>
            <div className="relative">
              <input
                type="text"
                name="area"
                value={formData.area}
                onChange={handleInputChange}
                placeholder="e.g. Coastal District / State"
                className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm"
              />
              <MapPin className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
            </div>
          </div>

          {/* Workers see federations with their PIN code, or in their city. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                City *
              </label>
              <div className="relative">
                <input
                  type="text"
                  name="city"
                  required
                  minLength={2}
                  maxLength={60}
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="e.g. Pune"
                  className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm"
                />
                <MapPin className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                PIN Code *
              </label>
              <div className="relative">
                <input
                  type="text"
                  name="pincode"
                  required
                  inputMode="numeric"
                  pattern="[1-9][0-9]{5}"
                  maxLength={6}
                  title="6-digit PIN code"
                  value={formData.pincode}
                  onChange={handleInputChange}
                  placeholder="e.g. 411001"
                  className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm"
                />
                <MapPin className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Official Email *
            </label>
            <div className="relative">
              <input
                type="email"
                name="email"
                required
                disabled
                value={formData.email}
                onChange={handleInputChange}
                className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 focus:outline-none text-sm cursor-not-allowed"
              />
              <Mail className="w-5 h-5 text-slate-600 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Fund Amount (₹)
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="amount"
                  min="0"
                  value={formData.amount}
                  onChange={handleInputChange}
                  placeholder="e.g. 50000"
                  className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm"
                />
                <IndianRupee className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                No. of Workers *
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="noOfWorkers"
                  required
                  min="1"
                  value={formData.noOfWorkers}
                  onChange={handleInputChange}
                  placeholder="e.g. 100"
                  className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm"
                />
                <Users className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Save details in database
            </p>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? 'Submitting...' : <>Submit Registration <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
