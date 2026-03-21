const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authenticateToken = require('../middleware/auth');
const prisma = new PrismaClient({});

// Получить все кейсы
router.get('/', authenticateToken, async (req, res) => {
    try {
        const cases = await prisma.case.findMany({
            include: {
                patient: true,
                doctor: { select: { id: true, name: true, role: true } },
                tech: { select: { id: true, name: true, role: true } },
                attachments: true,
                transactions: { orderBy: { date: 'desc' } }
            },
            orderBy: { createdAt: 'desc' }
        });
        // Пересчитываем paidAmount из реальных транзакций
        const casesWithRealPaid = cases.map(c => ({
            ...c,
            paidAmount: c.transactions
                .filter(t => t.type === 'income')
                .reduce((sum, t) => sum + (t.amountUSD || 0), 0)
        }));
        res.json(casesWithRealPaid);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения кейсов' });
    }
});

// Получить один кейс по ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const c = await prisma.case.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                patient: true,
                doctor: { select: { id: true, name: true, role: true } },
                tech: { select: { id: true, name: true, role: true } },
                attachments: true,
                transactions: { orderBy: { date: 'desc' } }
            }
        });
        if (!c) return res.status(404).json({ error: 'Заказ не найден' });
        const paidAmount = c.transactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + (t.amountUSD || 0), 0);
        res.json({ ...c, paidAmount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения заказа' });
    }
});

// Создать новый кейс
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { patientId, toothFormula, totalCost, status, dueDate } = req.body;
        const newCase = await prisma.case.create({
            data: {
                patientId,
                toothFormula,
                totalCost,
                status: status || 'new',
                dueDate: dueDate ? new Date(dueDate) : null,
                doctorId: req.user?.userId || null
            }
        });
        res.status(201).json(newCase);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка создания заказа' });
    }
});

// Получить задержанные кейсы (застряли в статусе дольше threshold дней)
router.get('/delayed/list', authenticateToken, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 3;
        const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const cases = await prisma.case.findMany({
            where: {
                status: { not: 'ready' },
                statusChangedAt: { lt: threshold }
            },
            include: { patient: true },
            orderBy: { statusChangedAt: 'asc' }
        });
        res.json(cases);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения задержанных кейсов' });
    }
});

// Обновить статус кейса
router.put('/:id/status', authenticateToken, async (req, res) => {
    try {
        const { status } = req.body;
        const updatedCase = await prisma.case.update({
            where: { id: parseInt(req.params.id) },
            data: { status, statusChangedAt: new Date() }
        });
        res.json(updatedCase);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка обновления статуса' });
    }
});

// Удалить кейс (только admin)
router.delete('/:id', authenticateToken, async (req, res) => {
    if (!['admin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Нет доступа' });
    }
    try {
        await prisma.case.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ message: 'Удалено' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка удаления' });
    }
});

module.exports = router;
