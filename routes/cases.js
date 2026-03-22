const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma'); // BUG FIX #1: use singleton
const authenticateToken = require('../middleware/auth');

const VALID_STATUSES = ['new', 'modeling', 'milling', 'sintering', 'fitting', 'ready'];

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

// BUG FIX #2: /delayed/list MUST be defined BEFORE /:id
// Previously Express matched "delayed" as an :id param and threw a cast error.
router.get('/delayed/list', authenticateToken, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 3;
        const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const cases = await prisma.case.findMany({
            where: {
                status: { not: 'ready' },
                statusChangedAt: { lt: threshold }
            },
            include: {
                patient: true,
                doctor: { select: { id: true, name: true } },
                tech: { select: { id: true, name: true } }
            },
            orderBy: { statusChangedAt: 'asc' }
        });
        res.json(cases);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения задержанных кейсов' });
    }
});

// BUG FIX #3: /overdue/list also before /:id
router.get('/overdue/list', authenticateToken, async (req, res) => {
    try {
        const now = new Date();
        const cases = await prisma.case.findMany({
            where: {
                status: { not: 'ready' },
                dueDate: { lt: now }
            },
            include: {
                patient: true,
                doctor: { select: { id: true, name: true } },
                tech: { select: { id: true, name: true } }
            },
            orderBy: { dueDate: 'asc' }
        });
        res.json(cases);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения просроченных кейсов' });
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
        const { patientId, toothFormula, totalCost, status, dueDate, techId } = req.body;
        if (!patientId) return res.status(400).json({ error: 'patientId обязателен' });
        const newCase = await prisma.case.create({
            data: {
                patientId: parseInt(patientId),
                toothFormula: toothFormula || '{}',
                totalCost: parseFloat(totalCost) || 0,
                status: status || 'new',
                dueDate: dueDate ? new Date(dueDate) : null,
                doctorId: req.user?.userId || null,
                techId: techId ? parseInt(techId) : null
            },
            include: {
                patient: true,
                doctor: { select: { id: true, name: true } },
                tech: { select: { id: true, name: true } }
            }
        });
        res.status(201).json(newCase);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка создания заказа' });
    }
});

// BUG FIX #4: General PUT /:id was completely missing.
// No way to update totalCost, dueDate, techId, doctorId, toothFormula.
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { toothFormula, totalCost, dueDate, techId, doctorId, status } = req.body;
        const data = {};
        if (toothFormula !== undefined) data.toothFormula = toothFormula;
        if (totalCost !== undefined) data.totalCost = parseFloat(totalCost);
        if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
        if (techId !== undefined) data.techId = techId ? parseInt(techId) : null;
        if (doctorId !== undefined) data.doctorId = doctorId ? parseInt(doctorId) : null;
        if (status !== undefined) {
            if (!VALID_STATUSES.includes(status)) {
                return res.status(400).json({ error: `Допустимые статусы: ${VALID_STATUSES.join(', ')}` });
            }
            data.status = status;
            data.statusChangedAt = new Date();
        }
        const updatedCase = await prisma.case.update({
            where: { id: parseInt(req.params.id) },
            data,
            include: {
                patient: true,
                doctor: { select: { id: true, name: true } },
                tech: { select: { id: true, name: true } }
            }
        });
        res.json(updatedCase);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка обновления заказа' });
    }
});

// Обновить только статус кейса
router.put('/:id/status', authenticateToken, async (req, res) => {
    try {
        const { status } = req.body;
        if (!VALID_STATUSES.includes(status)) {
            return res.status(400).json({ error: `Допустимые статусы: ${VALID_STATUSES.join(', ')}` });
        }
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
    if (req.user.role !== 'admin') {
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
