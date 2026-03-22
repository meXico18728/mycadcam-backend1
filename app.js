const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/cases', require('./routes/cases'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/restorations', require('./routes/restorations'));
app.use('/api/finances', require('./routes/finances'));
app.use('/api/users', require('./routes/users'));
app.use('/api/crm', require('./routes/crm'));

module.exports = app;
