const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // <-- Added for web auth
require('dotenv').config();

const authRoutes = require('./routes/auth'); // Existing app routes
const webAuthRoutes = require('./routes/webAuth'); // New web routes
const federationRoutes = require('./routes/federation'); // Federation management routes
const categoryRoutes = require('./routes/categories'); // Public job-category catalogue
const workerRoutes = require('./routes/worker'); // Register / deregister as a worker
const federationsRoutes = require('./routes/federations'); // App: federations near a worker
const jobRoutes = require('./routes/jobs'); // Post jobs, accept/start/complete, feedback
const uploadRoutes = require('./routes/uploads'); // Signed Cloudinary uploads for job photos
const workerModeRoutes = require('./routes/workers'); // Worker mode: online, offers, insights
const paymentRoutes = require('./routes/payments'); // Pay for jobs, receipts, worker payouts
const webhookRoutes = require('./routes/webhooks'); // Razorpay events (raw body)
const heatmapRoutes = require('./routes/heatmap'); // Demand / availability / gov heatmaps
const safetyRoutes = require('./routes/safety'); // App: safety shield, SOS, voice notes
const safetyAdminRoutes = require('./routes/safetyAdmin'); // Portal: SOS alerts for officials

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
// Webhooks verify a signature over the raw body, so they go before JSON parsing.
app.use('/api/webhooks', webhookRoutes);
app.use('/api/federation/me/workers/import', express.json({ limit: '2mb' }));
app.use(express.json());
app.use(cookieParser()); // <-- Allows reading HTTP-only cookies

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/web-auth', webAuthRoutes);
app.use('/api/federation', federationRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/worker', workerRoutes);
app.use('/api/federations', federationsRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/workers', workerModeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/heatmap', heatmapRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api/gov/safety', safetyAdminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SIH Backend is running' });
});

module.exports = app;
