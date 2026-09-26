import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import ProtectedRoute from './components/ProtectedRoute';
import FederationRegister from './pages/federation/FederationRegister';
import FederationStatus from './pages/federation/FederationStatus';
import GovernmentVerification from './pages/federation/GovernmentVerification';

function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-8 text-center">
      <h2 className="text-3xl font-bold mb-4">Dashboard</h2>
      <p className="text-slate-400">Welcome to your secure portal.</p>
    </div>
  );
}

function App() {
  const { isInitializing } = useAuth();

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-semibold tracking-wider uppercase text-blue-400 animate-pulse">
          Restoring Session...
        </p>
      </div>
    );
  }

  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-slate-950">
        <Navbar />
        <main className="flex-1">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Home />} />

            {/* Protected routes — require authentication */}
            <Route element={<ProtectedRoute />}>
              <Route path="/federation/register" element={<FederationRegister />} />
              <Route path="/federation/status" element={<FederationStatus />} />
              <Route path="/gov/verify" element={<GovernmentVerification />} />
              <Route path="/dashboard" element={<Dashboard />} />
            </Route>
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
