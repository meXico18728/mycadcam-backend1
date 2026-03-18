const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key_mycadcam';
const token = jwt.sign({ userId: 1, role: 'admin', name: 'DEAD' }, JWT_SECRET);
console.log(token);
fetch('http://localhost:4000/api/finances/stats', {
    headers: { 'Authorization': `Bearer ${token}` }
}).then(res => res.json()).then(console.log).catch(console.error);
fetch('http://localhost:4000/api/finances', {
    headers: { 'Authorization': `Bearer ${token}` }
}).then(res => res.json()).then(console.log).catch(console.error);
