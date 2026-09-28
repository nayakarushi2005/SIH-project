import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ClipboardCheck, FileText, Landmark, LayoutDashboard, LogOut, Map as MapIcon, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = {
  Federation: [
    { to: '/federation/status', label: 'Overview', icon: LayoutDashboard },
    { to: '/federation/workers', label: 'Worker requests', icon: Users },
    { to: '/federation/register', label: 'Registration', icon: FileText },
  ],
  GovOfficial: [
    { to: '/gov/verify', label: 'Verification', icon: ClipboardCheck },
    { to: '/gov/demand-map', label: 'Skill Demand Map', icon: MapIcon },
  ],
};

const FALLBACK_NAV = [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }];

const ROLE_LABEL = {
  Federation: 'Federation',
  GovOfficial: 'Government official',
};

export function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">
        <Landmark className="w-4 h-4" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-ink">GigWorkers Fed</span>
    </span>
  );
}

function navClass({ isActive }) {
  return `flex items-center gap-3 h-9 px-3 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-canvas hover:text-ink'
  }`;
}

function mobileNavClass({ isActive }) {
  return `flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium whitespace-nowrap ${
    isActive ? 'bg-accent-soft text-accent' : 'text-ink-2'
  }`;
}

export default function AppShell() {
  const { user, userType, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV[userType] || FALLBACK_NAV;
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas text-ink md:flex">
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-line bg-surface sticky top-0 h-screen">
        <div className="flex h-14 items-center px-5 border-b border-line">
          <Brand />
        </div>
        <nav className="flex-1 space-y-0.5 p-3" aria-label="Main">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navClass}>
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 h-9 px-3 rounded-md text-sm font-medium text-ink-2 hover:bg-canvas hover:text-ink"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-line bg-surface px-4 md:px-8">
          <div className="md:hidden">
            <Brand />
          </div>
          <div className="hidden md:block text-sm text-ink-3">{ROLE_LABEL[userType] || 'Portal'}</div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right leading-tight">
              <p className="text-sm font-medium text-ink">{user?.name}</p>
              <p className="text-xs text-ink-3">{user?.email}</p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
              {initial}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-canvas"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <nav className="md:hidden flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2" aria-label="Main">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={mobileNavClass}>
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
