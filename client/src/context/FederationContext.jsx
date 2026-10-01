import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useFetchWithAuth from '../hooks/useFetchWithAuth';
import { useAuth } from './AuthContext';

const FederationContext = createContext(null);

const LOAD_ERROR = 'Could not load your federation. Check your connection and try again.';

function emptyState(email) {
  return { email, version: 0, federation: null, memberCount: null, error: null, settled: false };
}

function isFederationRegistered(federation) {
  return Boolean(federation?.city && federation?.pincode);
}

export function FederationProvider({ children }) {
  const { user, userType } = useAuth();
  const authFetch = useFetchWithAuth();
  const authFetchRef = useRef(authFetch);
  const email = userType === 'Federation' ? user?.email || null : null;
  const [state, setState] = useState(() => emptyState(email));

  if (state.email !== email) {
    setState(emptyState(email));
  }

  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  const { version } = state;

  useEffect(() => {
    if (!email) return undefined;
    let cancelled = false;

    const settle = (patch) => {
      if (cancelled) return;
      setState((prev) => (prev.email === email ? { ...prev, ...patch, settled: true } : prev));
    };

    const load = async () => {
      try {
        const res = await authFetchRef.current(`/api/federation/check-email/${encodeURIComponent(email)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          settle({ error: data.message || LOAD_ERROR });
          return;
        }
        settle({ federation: data.federation || null, memberCount: data.memberCount ?? null, error: null });
      } catch {
        settle({ error: LOAD_ERROR });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [email, version]);

  const refresh = useCallback(() => {
    setState((prev) => ({
      ...prev,
      version: prev.version + 1,
      error: null,
      settled: prev.settled && Boolean(prev.federation),
    }));
  }, []);

  const setFederation = useCallback((federation) => {
    startTransition(() => {
      setState((prev) => ({ ...prev, federation, error: null, settled: true }));
    });
  }, []);

  const loading = Boolean(email) && !state.settled;

  const value = useMemo(
    () => ({
      federation: state.federation,
      memberCount: state.memberCount,
      loading,
      error: state.error,
      registered: isFederationRegistered(state.federation),
      refresh,
      setFederation,
    }),
    [state.federation, state.memberCount, state.error, loading, refresh, setFederation],
  );

  return <FederationContext.Provider value={value}>{children}</FederationContext.Provider>;
}

export function useFederation() {
  const context = useContext(FederationContext);
  if (!context) {
    throw new Error('useFederation must be used within a FederationProvider');
  }
  return context;
}
