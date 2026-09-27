import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

const AuthContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

/**
 * AuthProvider wraps the app and provides authentication state.
 *
 * State stored:
 *  - accessToken  (string | null)  — JWT from the backend
 *  - user         (object | null)  — { _id, name, email }
 *  - userType     (string | null)  — 'GovOfficial' | 'Federation'
 */
export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  /**
   * Called after a successful authentication response from the backend.
   * Expects the shape returned by POST /api/auth/google:
   *   { accessToken, isNewUser, user: { _id, name, email } }
   * `type` is the userType string sent during the auth request.
   */
  const login = useCallback((responseData, type) => {
    setAccessToken(responseData.accessToken);
    setUser(responseData.user);
    setUserType(type);
    setIsNewUser(responseData.isNewUser || false);
  }, []);

  /**
   * Clears all auth state — effectively logging the user out on the
   * client side, and tells the backend to clear the HTTP-only cookie.
   */
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/web-auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Failed to log out cleanly from server', err);
    } finally {
      setAccessToken(null);
      setUser(null);
      setUserType(null);
      setIsNewUser(false);
    }
  }, []);

  // Silent Refresh Check on Mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/web-auth/refresh`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          // The backend returns userType directly now
          login(data, data.userType);
        }
      } catch (error) {
        console.error('Session restore failed:', error);
      } finally {
        setIsInitializing(false);
      }
    };
    checkSession();
  }, [login]);

  const isAuthenticated = Boolean(accessToken);

  const value = useMemo(
    () => ({
      accessToken,
      user,
      userType,
      isNewUser,
      isAuthenticated,
      isInitializing,
      login,
      logout,
    }),
    [accessToken, user, userType, isNewUser, isAuthenticated, isInitializing, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook for consuming auth state anywhere in the component tree.
 * Must be called inside an <AuthProvider>.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
