const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const authRoutes = require('./routes/auth');
const patientsRoutes = require('./routes/patients');
const casesRoutes = require('./routes/cases');
const uploadRoutes = require('./routes/upload');
const restorationsRoutes = require('./routes/restorations');
const financesRoutes = require('./routes/finances');
const usersRoutes = require('./routes/users');
const path = require('path');

dotenv.config();

const app = express();
const prisma = new PrismaClient({});
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/restorations', restorationsRoutes);
app.use('/api/finances', financesRoutes);
app.use('/api/users', usersRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
