const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma'); // BUG FIX #1: singleton
const authenticateToken = require('../middleware/auth');

// BUG FIX #5: All routes were missing authenticateToken - unauthenticated users could read/write/delete

router.get('/', authenticateToken, async (req, res) => {
    try {
        const types = await prisma.restorationType.findMany({ orderBy: { name: 'asc' } });
        res.json(types);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при получении типов реставраций' });
    }
});

router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, priceUSD } = req.body;
        if (!name) return res.status(400).json({ error: 'Название обязательно' });
        const newType = await prisma.restorationType.create({
            data: { name, priceUSD: parseFloat(priceUSD) || 0 }
        });
        res.status(201).json(newType);
    } catch (error) {
        console.error(error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Тип реставрации с таким названием уже существует' });
        }
        res.status(500).json({ error: 'Ошибка при создании типа' });
    }
});

router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { name, priceUSD } = req.body;
        const updatedType = await prisma.restorationType.update({
            where: { id: parseInt(req.params.id) },
            data: { name, priceUSD: parseFloat(priceUSD) || 0 }
        });
        res.json(updatedType);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка обновления типа' });
    }
});

router.delete('/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    try {
        await prisma.restorationType.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: 'Успешно удалено' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при удалении типа' });
    }
});

router.post('/seed', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Нет доступа' });
    try {
        const existing = await prisma.restorationType.count();
        if (existing > 0) return res.json({ message: 'База уже содержит типы реставраций' });
        const defaultTypes = [
            { name: 'Коронка Emax', priceUSD: 15 },
            { name: 'Коронка из диоксида циркония', priceUSD: 18 },
            { name: 'Винир Emax', priceUSD: 16 },
            { name: 'Вкладка керамическая', priceUSD: 14 }
        ];
        await prisma.restorationType.createMany({ data: defaultTypes });
        res.json({ message: 'Базовые типы успешно добавлены' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка заполнения базы типов' });
    }
});

module.exports = router;
