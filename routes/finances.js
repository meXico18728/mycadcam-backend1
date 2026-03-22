const express = require('express');
const prisma = require('../lib/prisma'); // BUG FIX #1: singleton
const authenticateToken = require('../middleware/auth');

const router = express.Router();

const requireFinanceAccess = (req, res, next) => {
    if (!['admin', 'accountant', 'doctor'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }
    next();
};

// Получить все транзакции
router.get('/', authenticateToken, requireFinanceAccess, async (req, res) => {
    try {
        const transactions = await prisma.transaction.findMany({
            orderBy: { date: 'desc' },
            include: {
                case: { include: { patient: true, doctor: true } },
                patient: true
            }
        });
        res.json(transactions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при получении транзакций' });
    }
});

// Статистика
router.get('/stats', authenticateToken, requireFinanceAccess, async (req, res) => {
    try {
        const result = await prisma.transaction.groupBy({
            by: ['type'],
            _sum: { amountUSD: true, amountUZS: true }
        });
        const stats = {
            totalIncomeUSD: 0, totalIncomeUZS: 0,
            totalExpenseUSD: 0, totalExpenseUZS: 0,
            balanceUSD: 0, balanceUZS: 0
        };
        result.forEach(group => {
            if (group.type === 'income') {
                stats.totalIncomeUSD = group._sum.amountUSD || 0;
                stats.totalIncomeUZS = group._sum.amountUZS || 0;
            } else if (group.type === 'expense') {
                stats.totalExpenseUSD = group._sum.amountUSD || 0;
                stats.totalExpenseUZS = group._sum.amountUZS || 0;
            }
        });
        stats.balanceUSD = stats.totalIncomeUSD - stats.totalExpenseUSD;
        stats.balanceUZS = stats.totalIncomeUZS - stats.totalExpenseUZS;
        res.json(stats);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при получении статистики' });
    }
});

// Создать транзакцию
router.post('/', authenticateToken, requireFinanceAccess, async (req, res) => {
    const { type, amountUSD, amountUZS, description, caseId, patientId, date } = req.body;

    if (!type || (amountUSD === undefined && amountUZS === undefined)) {
        return res.status(400).json({ error: 'Тип и сумма обязательны' });
    }
    if (!['income', 'expense'].includes(type)) {
        return res.status(400).json({ error: 'Тип должен быть income или expense' });
    }

    try {
        let actualPatientId = patientId ? parseInt(patientId) : null;
        const parsedCaseId = caseId ? parseInt(caseId) : null;

        if (parsedCaseId && !actualPatientId) {
            const existingCase = await prisma.case.findUnique({ where: { id: parsedCaseId } });
            if (existingCase) actualPatientId = existingCase.patientId;
        }

        const transaction = await prisma.transaction.create({
            data: {
                type,
                amountUSD: parseFloat(amountUSD) || 0,
                amountUZS: parseFloat(amountUZS) || 0,
                description,
                caseId: parsedCaseId,
                patientId: actualPatientId,
                date: date ? new Date(date) : undefined
            }
        });

        // BUG FIX #6: Removed double paidAmount increment on Case model.
        // The GET endpoints recalculate paidAmount from transactions on every read,
        // so incrementing the stored field separately caused it to drift out of sync.
        // Now paidAmount on Case is only updated via the distribution logic below,
        // and display always recalculates from transactions.

        // BUG FIX #7: distribute unpaid amount using actualPatientId (was using parseInt(patientId)
        // which would be NaN when patientId was derived from the case)
        if (actualPatientId && !parsedCaseId && type === 'income') {
            let remainingAmount = parseFloat(amountUSD) || 0;
            if (remainingAmount > 0) {
                const allPatientCases = await prisma.case.findMany({
                    where: { patientId: actualPatientId },
                    orderBy: { createdAt: 'asc' }
                });
                // Recalculate paidAmount from transactions for accuracy
                const casesWithPaid = await Promise.all(allPatientCases.map(async c => {
                    const txSum = await prisma.transaction.aggregate({
                        where: { caseId: c.id, type: 'income' },
                        _sum: { amountUSD: true }
                    });
                    return { ...c, realPaid: txSum._sum.amountUSD || 0 };
                }));
                const unpaidCases = casesWithPaid.filter(c => c.realPaid < c.totalCost);
                for (const c of unpaidCases) {
                    if (remainingAmount <= 0) break;
                    const debt = c.totalCost - c.realPaid;
                    const paymentForThisCase = Math.min(debt, remainingAmount);
                    await prisma.case.update({
                        where: { id: c.id },
                        data: { paidAmount: { increment: paymentForThisCase } }
                    });
                    remainingAmount -= paymentForThisCase;
                }
            }
        }

        res.status(201).json(transaction);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при создании транзакции' });
    }
});

module.exports = router;
