import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { Building2, Landmark } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Brand } from '../components/AppShell';
import { Notice, Panel } from '../components/ui';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

function GoogleIcon() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.09 24.09 0 0 0 0 21.56l7.98-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function RoleButton({ icon: Icon, title, detail, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-4 rounded-md border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:border-line-strong hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-ink-3 mt-0.5">{detail}</span>
      </span>
      <GoogleIcon />
    </button>
  );
}

function SignInPanel({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGoogleSuccess = async (credentialResponse, userType) => {
    setLoading(true);
    setError(null);

    try {
      const accessToken = credentialResponse.access_token;

      const res = await fetch(`${API_BASE}/api/web-auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          googleToken: accessToken,
          userType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Authentication failed');
      }

      onLoginSuccess(data, userType);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loginAsFederation = useGoogleLogin({
    onSuccess: (cred) => handleGoogleSuccess(cred, 'Federation'),
    onError: () => setError('Google sign-in was cancelled or failed'),
    flow: 'implicit',
  });

  const loginAsGovt = useGoogleLogin({
    onSuccess: (cred) => handleGoogleSuccess(cred, 'GovOfficial'),
    onError: () => setError('Google sign-in was cancelled or failed'),
    flow: 'implicit',
  });

  return (
    <Panel className="p-6 sm:p-7">
      <h2 className="text-lg font-semibold text-ink">Sign in</h2>
      <p className="mt-1 text-sm text-ink-3">Choose your role, then continue with your Google account.</p>

      {error && <Notice className="mt-5">{error}</Notice>}

      <div className="mt-5 space-y-3">
        <RoleButton
          icon={Building2}
          title={loading ? 'Signing in' : 'Federation'}
          detail="Register and manage worker members"
          onClick={() => loginAsFederation()}
          disabled={loading}
        />
        <RoleButton
          icon={Landmark}
          title={loading ? 'Signing in' : 'Government official'}
          detail="Review and verify federations"
          onClick={() => loginAsGovt()}
          disabled={loading}
        />
      </div>

      <p className="mt-6 border-t border-line pt-4 text-xs text-ink-3">
        Signing in keeps you logged in on this device until you log out.
      </p>
    </Panel>
  );
}

export default function Home() {
  const { login, isAuthenticated, userType, isNewUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      if (userType === 'GovOfficial') {
        navigate('/gov/verify', { replace: true });
      } else if (userType === 'Federation') {
        if (isNewUser) {
          navigate('/federation/register', { replace: true });
        } else {
          navigate('/federation/status', { replace: true });
        }
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, userType, isNewUser, navigate]);

  const handleLoginSuccess = (responseData, userType) => {
    login(responseData, userType);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      <header className="h-14 border-b border-line bg-surface">
        <div className="mx-auto flex h-full max-w-6xl items-center px-4 sm:px-6">
          <Brand />
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_420px] lg:items-center lg:gap-16 lg:py-20">
          <div>
            <p className="text-sm font-medium text-accent">Gig worker federation portal</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
              Welfare and verification for India's gig worker federations
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-2">
              One place for federations and government bodies to work together on transparent welfare,
              compliance and collective bargaining.
            </p>

            <dl className="mt-10 max-w-xl divide-y divide-line border-y border-line">
              <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
                <dt className="text-sm font-medium text-ink">Federations</dt>
                <dd className="text-sm text-ink-2">
                  Register your federation, follow its verification status and accept workers who ask to join.
                </dd>
              </div>
              <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
                <dt className="text-sm font-medium text-ink">Government officials</dt>
                <dd className="text-sm text-ink-2">
                  Review registrations and verify the federations that meet the requirements.
                </dd>
              </div>
            </dl>
          </div>

          <SignInPanel onLoginSuccess={handleLoginSuccess} />
        </div>
      </main>
    </div>
  );
}
