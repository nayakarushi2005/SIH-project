import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, ShieldAlert } from 'lucide-react';

export default function Navbar() {
  const { isAuthenticated, user, userType, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <nav className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Home Link */}
          <Link 
            to="/" 
            className="flex items-center gap-2 group transition-all"
            aria-label="Home"
          >
            <div className="bg-gradient-to-tr from-blue-600 to-emerald-500 text-white p-1.5 rounded-lg shadow-lg group-hover:shadow-blue-500/25 transition-all">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <span className="text-xl font-extrabold text-white tracking-tight">
              Gig<span className="text-blue-400">Workers</span> Fed
            </span>
          </Link>

          {/* Right side - Conditional Auth UI */}
          {isAuthenticated && user && (
            <div className="flex items-center gap-6">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-bold text-slate-200">
                  {user.name}
                </span>
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${userType === 'GovOfficial' ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                  {userType === 'GovOfficial' ? 'Government Official' : 'Federation'}
                </span>
              </div>
              
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-rose-500/10 hover:text-rose-400 text-slate-400 hover:border-rose-500/30 border border-slate-800 rounded-xl text-sm font-semibold transition-all shadow-md"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
