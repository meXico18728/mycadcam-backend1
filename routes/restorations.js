const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Получить все типы реставраций
router.get('/', async (req, res) => {
    try {
        const types = await prisma.restorationType.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(types);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при получении типов реставраций' });
    }
});

// Добавить новый тип
router.post('/', async (req, res) => {
    try {
        const { name, priceUSD } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Название обязательно' });
        }

        const newType = await prisma.restorationType.create({
            data: {
                name,
                priceUSD: parseFloat(priceUSD) || 0
            }
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

// Обновить цену типа (или название)
router.put('/:id', async (req, res) => {
    try {
        const { name, priceUSD } = req.body;
        const updatedType = await prisma.restorationType.update({
            where: { id: parseInt(req.params.id) },
            data: {
                name,
                priceUSD: parseFloat(priceUSD) || 0
            }
        });
        res.json(updatedType);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка обновления типа' });
    }
});

// Удалить тип
router.delete('/:id', async (req, res) => {
    try {
        await prisma.restorationType.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ message: 'Успешно удалено' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при удалении типа' });
    }
});

// Инициализация дефолтных типов (Seed)
router.post('/seed', async (req, res) => {
    try {
        const existing = await prisma.restorationType.count();
        if (existing > 0) {
            return res.json({ message: 'База уже содержит типы реставраций' });
        }

        const defaultTypes = [
            { name: 'Коронка Emax', priceUSD: 15 },
            { name: 'Коронка из диоксида циркония', priceUSD: 18 },
            { name: 'Винир Emax', priceUSD: 16 },
            { name: 'Вкладка керамическая', priceUSD: 14 }
        ];

        await prisma.restorationType.createMany({
            data: defaultTypes
        });

        res.json({ message: 'Базовые типы успешно добавлены' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошбика заполнения базы типов' });
    }
});

module.exports = router;
