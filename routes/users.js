const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const authenticateToken = require('../middleware/auth');

const prisma = new PrismaClient();

// GET /api/users — список всех пользователей (только admin)
router.get('/', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    try {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, emailOrPhone: true, role: true }
        });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// POST /api/users — создать пользователя (только admin)
router.post('/', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    const { name, emailOrPhone, password, role } = req.body;
    if (!name || !emailOrPhone || !password || !role) return res.status(400).json({ error: 'Все поля обязательны' });
    if (!['admin', 'doctor', 'tech', 'accountant'].includes(role)) return res.status(400).json({ error: 'Неверная роль' });
    try {
        const exists = await prisma.user.findUnique({ where: { emailOrPhone } });
        if (exists) return res.status(400).json({ error: 'Пользователь уже существует' });
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({ data: { name, emailOrPhone, passwordHash, role } });
        res.status(201).json({ id: user.id, name: user.name, emailOrPhone: user.emailOrPhone, role: user.role });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// PUT /api/users/:id — обновить пользователя (только admin)
router.put('/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    const { name, role, password } = req.body;
    const data = {};
    if (name) data.name = name;
    if (role && ['admin', 'doctor', 'tech', 'accountant'].includes(role)) data.role = role;
    if (password) data.passwordHash = await bcrypt.hash(password, 10);
    try {
        const user = await prisma.user.update({
            where: { id: parseInt(req.params.id) },
            data,
            select: { id: true, name: true, emailOrPhone: true, role: true }
        });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// DELETE /api/users/:id — удалить пользователя (только admin, нельзя себя)
router.delete('/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    if (req.user.userId === parseInt(req.params.id)) return res.status(400).json({ error: 'Нельзя удалить себя' });
    try {
        await prisma.user.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: 'Удалено' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
