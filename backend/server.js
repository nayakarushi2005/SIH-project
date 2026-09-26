const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser'); // <-- Added for web auth
require('dotenv').config();

const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const uploadRoutes = require('./routes/uploads');
const workerRoutes = require('./routes/workers');
const authRoutes = require('./routes/auth'); // Existing app routes
const webAuthRoutes = require('./routes/webAuth'); // New web routes
const federationRoutes = require('./routes/federation'); // Federation management routes

const app = express();

app.use(cors());
// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser()); // <-- Allows reading HTTP-only cookies

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/web-auth', webAuthRoutes);
app.use('/api/federation', federationRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SIH Backend is running fine' });
});


// ── MongoDB Connection ───────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sih-database';

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    const PORT = process.env.PORT || 3000;
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });
