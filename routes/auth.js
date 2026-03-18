const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({});

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key_mycadcam';

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { name, emailOrPhone, password, role } = req.body;

        const existingUser = await prisma.user.findUnique({ where: { emailOrPhone } });
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const userRole = role || 'doctor';

        if (!['admin', 'doctor', 'tech', 'accountant'].includes(userRole)) {
            return res.status(400).json({ error: 'Неверная роль' });
        }

        const newUser = await prisma.user.create({
            data: {
                name,
                emailOrPhone,
                passwordHash,
                role: userRole
            }
        });

        res.status(201).json({ message: 'Регистрация успешна', userId: newUser.id });
    } catch (error) {
        console.error('Register error', error);
        res.status(500).json({ error: 'Ошибка при регистрации' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { emailOrPhone, password } = req.body;

        const user = await prisma.user.findUnique({ where: { emailOrPhone } });
        if (!user) {
            return res.status(400).json({ error: 'Неверные учетные данные' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ error: 'Неверные учетные данные' });
        }

        const payload = {
            userId: user.id,
            role: user.role,
            name: user.name,
            theme: user.themePreference
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user: payload });
    } catch (error) {
        console.error('Login error', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
