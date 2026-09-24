import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import FederationRegister from './pages/federation/FederationRegister';
import GovernmentVerification from './pages/federation/GovernmentVerification';
import FederationStatus from './pages/federation/FederationStatus';

function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 text-center bg-white text-slate-900">
      <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-7xl mb-6">
        Welcome to your <span className="text-blue-600">React Boilerplate</span>
      </h1>
      <p className="max-w-2xl text-lg leading-8 text-gray-600 mb-8">
        This is a boilerplate template using React, Vite, React Router, and Tailwind CSS. 
        Start building your application by editing this component.
      </p>
      <div className="flex gap-4">
        <a href="#" className="rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          Get Started
        </a>
        <a href="#" className="text-sm font-semibold leading-6 text-gray-900 px-3.5 py-2.5">
          Learn more <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  );
}

function Navbar() {
  return (
    <nav className="flex items-center justify-between p-6 lg:px-8 border-b border-gray-200 h-16 bg-white text-gray-900">
      <div className="flex lg:flex-1">
        <Link to="/" className="-m-1.5 p-1.5 text-xl font-bold">
          Logo
        </Link>
      </div>
      <div className="flex gap-x-12">
        <Link to="/" className="text-sm font-semibold leading-6 text-gray-900">Home</Link>
        <Link to="/about" className="text-sm font-semibold leading-6 text-gray-900">About</Link>
      </div>
    </nav>
  );
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-white">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<div className="p-8 text-center text-slate-900"><h2 className="text-2xl font-bold">About Page</h2></div>} />
            
            {/* Separate Federation Registration Page (URL: /federation/register) */}
            <Route path="/federation/register" element={<FederationRegister />} />
            
            {/* Separate Federation Status Page (URL: /federation/status) */}
            <Route path="/federation/status" element={<FederationStatus />} />
            
            {/* Separate Government Verification Page (URL: /gov/verify) */}
            <Route path="/gov/verify" element={<GovernmentVerification />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
