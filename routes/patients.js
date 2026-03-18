const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({});

const authenticateToken = require('../middleware/auth');

// Получить всех пациентов
router.get('/', authenticateToken, async (req, res) => {
    try {
        const patients = await prisma.patient.findMany({
            include: {
                cases: {
                    include: { transactions: true }
                },
                transactions: { orderBy: { date: 'desc' } }
            },
            orderBy: { id: 'desc' }
        });
        // Пересчитываем paidAmount из реальных транзакций для каждого кейса
        const result = patients.map(p => ({
            ...p,
            cases: p.cases.map(c => ({
                ...c,
                paidAmount: c.transactions
                    .filter(t => t.type === 'income')
                    .reduce((sum, t) => sum + (t.amountUSD || 0), 0)
            }))
        }));
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения пациентов' });
    }
});

// Создать нового пациента (анкета)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, phone } = req.body;

        if (!name || !phone) {
            return res.status(400).json({ error: 'Имя и телефон обязательны' });
        }

        const newPatient = await prisma.patient.create({
            data: { name, phone }
        });
        res.status(201).json(newPatient);
    } catch (error) {
        console.error(error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Пациент с таким номером телефона уже существует' });
        }
        res.status(500).json({ error: 'Ошибка создания пациента' });
    }
});

// Получить пациента по ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const patient = await prisma.patient.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                cases: {
                    include: { transactions: { orderBy: { date: 'desc' } } },
                    orderBy: { createdAt: 'desc' }
                },
                transactions: { orderBy: { date: 'desc' } }
            }
        });
        if (!patient) return res.status(404).json({ error: 'Пациент не найден' });

        // Пересчитываем paidAmount для каждого кейса из его транзакций
        const casesWithRealPaid = patient.cases.map(c => ({
            ...c,
            paidAmount: c.transactions
                .filter(t => t.type === 'income')
                .reduce((sum, t) => sum + (t.amountUSD || 0), 0)
        }));

        // Объединяем ВСЕ транзакции заказчика: прямые (patientId) + через кейсы (caseId)
        const directTxIds = new Set(patient.transactions.map(t => t.id));
        const caseTxs = patient.cases.flatMap(c => c.transactions).filter(t => !directTxIds.has(t.id));
        const allTransactions = [...patient.transactions, ...caseTxs]
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ ...patient, cases: casesWithRealPaid, transactions: allTransactions });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения пациента' });
    }
});

// Обновить пациента
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { name, phone } = req.body;
        const updatedPatient = await prisma.patient.update({
            where: { id: parseInt(req.params.id) },
            data: { name, phone }
        });
        res.json(updatedPatient);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка обновления пациента' });
    }
});

module.exports = router;
