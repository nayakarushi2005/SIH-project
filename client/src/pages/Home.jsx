import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import './Home.css';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

/* ── Inline SVG for the Google "G" icon ─────────────────────────── */
function GoogleIcon() {
  return (
    <svg className="google-icon" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.09 24.09 0 0 0 0 21.56l7.98-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/* ── Login Modal ────────────────────────────────────────────────── */
function LoginModal({ open, onClose, onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Sends the Google credential (ID token) to our backend with the
   * chosen userType. On success calls onLoginSuccess which updates
   * AuthContext and navigates away.
   */
  const handleGoogleSuccess = async (credentialResponse, userType) => {
    setLoading(true);
    setError(null);

    try {
      // useGoogleLogin with flow: 'implicit' returns an access_token, not a credential JWT!
      const accessToken = credentialResponse.access_token;
      
      const res = await fetch(`${API_BASE}/api/web-auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // so the backend can set the refreshToken cookie
        body: JSON.stringify({
          googleToken: accessToken,
          userType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Authentication failed');
      }

      // data = { message, accessToken, user: { _id, name, email } }
      onLoginSuccess(data, userType);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * useGoogleLogin gives us a function that opens the Google sign‑in
   * popup. We create one per role so each button sends the right
   * userType to the backend.
   *
   * `flow: 'auth-code'` is NOT what we want here — we need the
   * ID‑token flow (implicit / popup) so we get `credential` back,
   * which is a JWT the backend can verify with verifyIdToken().
   */
  const loginAsFederation = useGoogleLogin({
    onSuccess: (cred) => handleGoogleSuccess(cred, 'Federation'),
    onError: () => setError('Google sign‑in was cancelled or failed'),
    flow: 'implicit',
  });

  const loginAsGovt = useGoogleLogin({
    onSuccess: (cred) => handleGoogleSuccess(cred, 'GovOfficial'),
    onError: () => setError('Google sign‑in was cancelled or failed'),
    flow: 'implicit',
  });

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button className="modal-close" onClick={onClose} aria-label="Close" disabled={loading}>
          ✕
        </button>

        <h2 className="modal-title">Sign in to GigWorkers Fed</h2>
        <p className="modal-subtitle">Choose your role to continue</p>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-buttons">
          <button
            className="google-btn google-btn--federation"
            onClick={() => loginAsFederation()}
            disabled={loading}
          >
            <GoogleIcon />
            <span>{loading ? 'Signing in…' : 'Login as a Federation'}</span>
          </button>

          <button
            className="google-btn google-btn--govt"
            onClick={() => loginAsGovt()}
            disabled={loading}
          >
            <GoogleIcon />
            <span>{loading ? 'Signing in…' : 'Login as a Govt Official'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Home Page ──────────────────────────────────────────────────── */
export default function Home() {
  const [showLogin, setShowLogin] = useState(false);
  const { login, isAuthenticated, userType, isNewUser } = useAuth();
  const navigate = useNavigate();

  // Smart routing: whenever isAuthenticated becomes true, route based on role
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

  /**
   * Called by the modal after a successful backend response.
   * Persists auth state and closes the modal.
   * The useEffect above will handle the actual redirection.
   */
  const handleLoginSuccess = (responseData, userType) => {
    login(responseData, userType);
    setShowLogin(false);
  };

  return (
    <section className="home">
      {/* Animated gradient orbs for visual depth */}
      <div className="home__orb home__orb--1" aria-hidden="true" />
      <div className="home__orb home__orb--2" aria-hidden="true" />
      <div className="home__orb home__orb--3" aria-hidden="true" />

      <div className="home__content">
        <span className="home__badge">Empowering India's Gig Economy</span>

        <h1 className="home__title">
          Gig<span className="home__title--accent">Workers</span> Fed
        </h1>

        <p className="home__description">
          A unified platform connecting gig‑worker federations with
          government bodies — enabling transparent welfare, real‑time
          compliance, and collective bargaining at scale.
        </p>

        <button
          id="login-trigger"
          className="home__login-btn"
          onClick={() => setShowLogin(true)}
        >
          Login
          <span className="home__login-btn-arrow" aria-hidden="true">→</span>
        </button>
      </div>

      <LoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </section>
  );
}
