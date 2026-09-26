const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // <-- Added for web auth
require('dotenv').config();

const authRoutes = require('./routes/auth'); // Existing app routes
const webAuthRoutes = require('./routes/webAuth'); // New web routes
const federationRoutes = require('./routes/federation'); // Federation management routes
const categoryRoutes = require('./routes/categories'); // Public job-category catalogue

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser()); // <-- Allows reading HTTP-only cookies

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/web-auth', webAuthRoutes);
app.use('/api/federation', federationRoutes);
app.use('/api/categories', categoryRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SIH Backend is running' });
});

module.exports = app;
