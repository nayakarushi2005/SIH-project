import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 text-center">
      <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-7xl mb-6">
        Welcome to your <span className="text-blue-600">React Boilerplate</span>
      </h1>
      <p className="max-w-2xl text-lg leading-8 text-gray-600 mb-8">
        This is a boilerplate template using React, Vite, React Router, and Tailwind CSS v4. 
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
    <nav className="flex items-center justify-between p-6 lg:px-8 border-b border-gray-200 h-16">
      <div className="flex lg:flex-1">
        <a href="/" className="-m-1.5 p-1.5 text-xl font-bold">
          Logo
        </a>
      </div>
      <div className="flex gap-x-12">
        <a href="/" className="text-sm font-semibold leading-6 text-gray-900">Home</a>
        <a href="/about" className="text-sm font-semibold leading-6 text-gray-900">About</a>
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
            <Route path="/about" element={<div className="p-8 text-center"><h2 className="text-2xl font-bold">About Page</h2></div>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
