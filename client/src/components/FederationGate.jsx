import { Navigate, Outlet, useMatch } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFederation } from '../context/FederationContext';
import { Button, Loading, Notice } from './ui';

const REGISTER_PATH = '/federation/register';
const STATUS_PATH = '/federation/status';

export default function FederationGate() {
  const { userType } = useAuth();
  const { federation, loading, error, registered, refresh } = useFederation();
  const onRegisterPage = Boolean(useMatch(REGISTER_PATH));

  if (userType !== 'Federation') {
    return <Outlet />;
  }

  if (loading) {
    return <Loading label="Loading your federation" />;
  }

  if (error && !federation) {
    return (
      <Notice>
        <p>{error}</p>
        <Button variant="secondary" size="sm" onClick={refresh} className="mt-3">
          Try again
        </Button>
      </Notice>
    );
  }

  if (!registered && !onRegisterPage) {
    return <Navigate to={REGISTER_PATH} replace />;
  }

  if (registered && onRegisterPage && federation.status !== 'rejected') {
    return <Navigate to={STATUS_PATH} replace />;
  }

  return <Outlet />;
}
