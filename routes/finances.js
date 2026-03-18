const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticateToken = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Проверка прав доступа для финансов
const requireFinanceAccess = (req, res, next) => {
    if (!['admin', 'accountant', 'doctor'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }
    next();
};

// 1. Получить все транзакции (опционально с фильтрацией по датам)
router.get('/', authenticateToken, requireFinanceAccess, async (req, res) => {
    try {
        const transactions = await prisma.transaction.findMany({
            orderBy: { date: 'desc' },
            include: {
                case: {
                    include: {
                        patient: true,
                        doctor: true
                    }
                },
                patient: true
            }
        });
        res.json(transactions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при получении транзакций' });
    }
});

// 2. Получить общую статистику (Баланс, Доходы, Расходы)
router.get('/stats', authenticateToken, requireFinanceAccess, async (req, res) => {
    try {
        const result = await prisma.transaction.groupBy({
            by: ['type'],
            _sum: {
                amountUSD: true,
                amountUZS: true
            }
        });

        const stats = {
            totalIncomeUSD: 0,
            totalIncomeUZS: 0,
            totalExpenseUSD: 0,
            totalExpenseUZS: 0,
            balanceUSD: 0,
            balanceUZS: 0
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

// 3. Создать транзакцию (доход или расход)
router.post('/', authenticateToken, requireFinanceAccess, async (req, res) => {
    const { type, amountUSD, amountUZS, description, caseId, patientId, date } = req.body;

    if (!type || (amountUSD === undefined && amountUZS === undefined)) {
        return res.status(400).json({ error: 'Тип и сумма обязательны' });
    }

    try {
        let actualPatientId = patientId ? parseInt(patientId) : null;
        const parsedCaseId = caseId ? parseInt(caseId) : null;

        if (parsedCaseId && !actualPatientId) {
            const existingCase = await prisma.case.findUnique({ where: { id: parsedCaseId } });
            if (existingCase) {
                actualPatientId = existingCase.patientId;
            }
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

        // 1. Оплата за конкретный заказ (уже обновляет paidAmount сразу)
        if (parsedCaseId && type === 'income') {
            await prisma.case.update({
                where: { id: parsedCaseId },
                data: {
                    paidAmount: {
                        increment: parseFloat(amountUSD) || 0
                    }
                }
            });
        }

        // 2. Оплата от пациента (клиники) без привязки к конкретному кейсу - распределяем по всем его долгам от старых к новым
        if (actualPatientId && !parsedCaseId && type === 'income') {
            let remainingAmount = parseFloat(amountUSD) || 0;
            if (remainingAmount > 0) {
                // Ищем все заказы пациента, сортируем по дате создания
                const allPatientCases = await prisma.case.findMany({
                    where: {
                        patientId: parseInt(patientId)
                    },
                    orderBy: {
                        createdAt: 'asc'
                    }
                });

                // Выбираем только те, где paidAmount < totalCost
                const unpaidCases = allPatientCases.filter(c => (c.paidAmount || 0) < c.totalCost);

                for (const c of unpaidCases) {
                    if (remainingAmount <= 0) break;

                    const debt = c.totalCost - c.paidAmount;
                    const paymentForThisCase = Math.min(debt, remainingAmount);

                    await prisma.case.update({
                        where: { id: c.id },
                        data: {
                            paidAmount: {
                                increment: paymentForThisCase
                            }
                        }
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
