import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import AppShell from './components/AppShell';
import { Loading, PageHeader, Panel } from './components/ui';
import Home from './pages/Home';
import ProtectedRoute from './components/ProtectedRoute';
import FederationRegister from './pages/federation/FederationRegister';
import FederationStatus from './pages/federation/FederationStatus';
import GovernmentVerification from './pages/federation/GovernmentVerification';
import WorkerRequests from './pages/federation/WorkerRequests';
import FederationDashboard from './pages/federation/FederationDashboard';
import { lazy, Suspense } from 'react';

// Google Maps + deck.gl are heavy — only officials opening the map load them.
const DemandMap = lazy(() => import('./pages/gov/DemandMap'));

function Dashboard() {
  return (
    <>
      <PageHeader title="Dashboard" description="Welcome to your secure portal." />
      <Panel className="px-5 py-10 text-center text-sm text-ink-3">Nothing to show yet.</Panel>
    </>
  );
}

function App() {
  const { isInitializing } = useAuth();

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center gap-2 text-sm text-ink-3">
        <Loader2 className="w-4 h-4 animate-spin" />
        Restoring session
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/federation/register" element={<FederationRegister />} />
            <Route path="/federation/status" element={<FederationStatus />} />
            <Route path="/federation/workers" element={<WorkerRequests />} />
            <Route path="/federation/dashboard" element={<FederationDashboard />} />
            <Route path="/gov/verify" element={<GovernmentVerification />} />
            <Route
              path="/gov/demand-map"
              element={
                <Suspense fallback={<Loading label="Loading map" />}>
                  <DemandMap />
                </Suspense>
              }
            />
            <Route path="/dashboard" element={<Dashboard />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
