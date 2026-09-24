import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerFederationApi, checkFederationByEmailApi } from '../../services/api';
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

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    area: '',
    amount: '',
    noOfWorkers: '',
  });

  const [checkEmail, setCheckEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Check if federation already exists by email
  const handleEmailCheck = async (e) => {
    if (e) e.preventDefault();
    const emailToTest = checkEmail.trim() || formData.email.trim();
    if (!emailToTest) return;

    setChecking(true);
    setError(null);
    try {
      const data = await checkFederationByEmailApi(emailToTest);
      if (data.exists && data.federation) {
        // Registered already -> Directly redirect to Federation Status page
        navigate('/federation/status', {
          state: { federation: data.federation },
        });
      } else {
        setError('No federation found for this email. Please fill in the registration details below.');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error checking registration status');
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // First check if email already registered
      const checkData = await checkFederationByEmailApi(formData.email);
      if (checkData.exists && checkData.federation) {
        // Already registered -> Directly redirect to Status page!
        navigate('/federation/status', {
          state: { federation: checkData.federation },
        });
        return;
      }

      // If not registered -> Register new federation
      const data = await registerFederationApi({
        name: formData.name,
        email: formData.email,
        amount: Number(formData.amount) || 0,
        noOfWorkers: Number(formData.noOfWorkers) || 0,
        area: formData.area,
      });

      // Save details in DB -> Directly redirect to Federation Status page showing verified/unverified
      navigate('/federation/status', {
        state: { federation: data.federation },
      });
    } catch (err) {
      // If error payload indicates existing federation, navigate to status screen
      if (err.response?.data?.exists && err.response?.data?.federation) {
        navigate('/federation/status', {
          state: { federation: err.response.data.federation },
        });
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to submit registration');
      }
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

        {/* Existing User Email Lookup Bar */}
        <form onSubmit={handleEmailCheck} className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800 shadow-xl flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type="email"
              placeholder="Already registered? Enter your email..."
              value={checkEmail}
              onChange={(e) => setCheckEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder-slate-500"
            />
            <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          </div>
          <button
            type="submit"
            disabled={checking || !checkEmail.trim()}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-blue-400 font-bold rounded-xl text-xs transition-all border border-slate-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {checking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <><Search className="w-3.5 h-3.5" /> Check Status</>}
          </button>
        </form>

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

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Official Email *
            </label>
            <div className="relative">
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                placeholder="e.g. contact@federation.org"
                className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm"
              />
              <Mail className="w-5 h-5 text-slate-500 absolute left-3.5 top-3.5" />
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
