/**
 * CRM Module for Dental Laboratory
 * Контроль производства и сроков для зуботехнических лабораторий
 */
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const authenticateToken = require('../middleware/auth');

// ─────────────────────────────────────────────
// DASHBOARD — сводная статистика лаборатории
// GET /api/crm/dashboard
// ─────────────────────────────────────────────
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const now = new Date();

        // Кейсы по статусам
        const casesByStatus = await prisma.case.groupBy({
            by: ['status'],
            _count: { id: true }
        });
        const statusMap = {};
        casesByStatus.forEach(s => { statusMap[s.status] = s._count.id; });

        // Просроченные (dueDate < now, не ready)
        const overdueCount = await prisma.case.count({
            where: { status: { not: 'ready' }, dueDate: { lt: now } }
        });

        // Срок истекает сегодня (dueDate в пределах 24ч)
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const dueTodayCount = await prisma.case.count({
            where: {
                status: { not: 'ready' },
                dueDate: { gte: now, lt: tomorrow }
            }
        });

        // Финансы за текущий месяц
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthlyTx = await prisma.transaction.groupBy({
            by: ['type'],
            where: { date: { gte: monthStart } },
            _sum: { amountUSD: true, amountUZS: true }
        });
        const monthlyStats = { incomeUSD: 0, incomeUZS: 0, expenseUSD: 0, expenseUZS: 0 };
        monthlyTx.forEach(t => {
            if (t.type === 'income') {
                monthlyStats.incomeUSD = t._sum.amountUSD || 0;
                monthlyStats.incomeUZS = t._sum.amountUZS || 0;
            } else {
                monthlyStats.expenseUSD = t._sum.amountUSD || 0;
                monthlyStats.expenseUZS = t._sum.amountUZS || 0;
            }
        });

        // Новые заказы за сегодня
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const newTodayCount = await prisma.case.count({
            where: { createdAt: { gte: todayStart } }
        });

        // Общий долг клиентов (totalCost - paidAmount по активным кейсам)
        const activeCases = await prisma.case.findMany({
            where: { status: { not: 'ready' } },
            select: { id: true, totalCost: true }
        });
        const activeCaseIds = activeCases.map(c => c.id);
        const paidSums = await prisma.transaction.groupBy({
            by: ['caseId'],
            where: { caseId: { in: activeCaseIds }, type: 'income' },
            _sum: { amountUSD: true }
        });
        const paidMap = {};
        paidSums.forEach(p => { paidMap[p.caseId] = p._sum.amountUSD || 0; });
        const totalDebtUSD = activeCases.reduce((sum, c) => {
            return sum + Math.max(0, c.totalCost - (paidMap[c.id] || 0));
        }, 0);

        res.json({
            casesByStatus: statusMap,
            overdueCount,
            dueTodayCount,
            newTodayCount,
            totalActiveCount: activeCases.length,
            totalDebtUSD: Math.round(totalDebtUSD * 100) / 100,
            monthlyFinance: monthlyStats
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения дашборда' });
    }
});

// ─────────────────────────────────────────────
// ПРОИЗВОДСТВЕННЫЙ КОНВЕЙЕР
// GET /api/crm/production
// Возвращает все активные кейсы, сгруппированные по этапам производства
// ─────────────────────────────────────────────
router.get('/production', authenticateToken, async (req, res) => {
    try {
        const stages = ['new', 'modeling', 'milling', 'sintering', 'fitting', 'ready'];
        const stageLabels = {
            new: 'Новый',
            modeling: 'Моделирование',
            milling: 'Фрезерование',
            sintering: 'Спекание',
            fitting: 'Примерка',
            ready: 'Готово'
        };

        const allCases = await prisma.case.findMany({
            include: {
                patient: { select: { id: true, name: true, phone: true } },
                doctor: { select: { id: true, name: true } },
                tech: { select: { id: true, name: true } }
            },
            orderBy: { dueDate: 'asc' }
        });

        const now = new Date();
        const pipeline = stages.map(stage => ({
            stage,
            label: stageLabels[stage],
            cases: allCases
                .filter(c => c.status === stage)
                .map(c => ({
                    ...c,
                    isOverdue: c.dueDate && c.dueDate < now && stage !== 'ready',
                    daysInStage: Math.floor((now - new Date(c.statusChangedAt)) / (1000 * 60 * 60 * 24))
                }))
        }));

        res.json(pipeline);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения производственного конвейера' });
    }
});

// ─────────────────────────────────────────────
// КОНТРОЛЬ СРОКОВ
// GET /api/crm/deadlines
// ─────────────────────────────────────────────
router.get('/deadlines', authenticateToken, async (req, res) => {
    try {
        const now = new Date();
        const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Просроченные
        const overdue = await prisma.case.findMany({
            where: { status: { not: 'ready' }, dueDate: { lt: now } },
            include: {
                patient: { select: { id: true, name: true } },
                tech: { select: { id: true, name: true } },
                doctor: { select: { id: true, name: true } }
            },
            orderBy: { dueDate: 'asc' }
        });

        // Срок скоро (7 дней)
        const upcoming = await prisma.case.findMany({
            where: {
                status: { not: 'ready' },
                dueDate: { gte: now, lte: in7days }
            },
            include: {
                patient: { select: { id: true, name: true } },
                tech: { select: { id: true, name: true } },
                doctor: { select: { id: true, name: true } }
            },
            orderBy: { dueDate: 'asc' }
        });

        // Без срока сдачи
        const noDueDate = await prisma.case.findMany({
            where: { status: { not: 'ready' }, dueDate: null },
            include: {
                patient: { select: { id: true, name: true } },
                tech: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        const enriched = (list) => list.map(c => ({
            ...c,
            daysOverdue: c.dueDate ? Math.floor((now - new Date(c.dueDate)) / (1000 * 60 * 60 * 24)) : null,
            daysLeft: c.dueDate ? Math.ceil((new Date(c.dueDate) - now) / (1000 * 60 * 60 * 24)) : null
        }));

        res.json({
            overdue: enriched(overdue),
            upcoming: enriched(upcoming),
            noDueDate
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения сроков' });
    }
});

// ─────────────────────────────────────────────
// WORKLOAD — нагрузка по техникам
// GET /api/crm/workload
// ─────────────────────────────────────────────
router.get('/workload', authenticateToken, async (req, res) => {
    try {
        const now = new Date();
        const techs = await prisma.user.findMany({
            where: { role: 'tech' },
            select: { id: true, name: true }
        });

        const workload = await Promise.all(techs.map(async (tech) => {
            const activeCases = await prisma.case.findMany({
                where: { techId: tech.id, status: { not: 'ready' } },
                select: { id: true, status: true, dueDate: true, totalCost: true, patient: { select: { name: true } } }
            });
            const overdue = activeCases.filter(c => c.dueDate && c.dueDate < now).length;
            return {
                tech,
                totalActive: activeCases.length,
                overdueCount: overdue,
                cases: activeCases
            };
        }));

        // Неназначенные кейсы
        const unassigned = await prisma.case.findMany({
            where: { techId: null, status: { not: 'ready' } },
            include: { patient: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'asc' }
        });

        res.json({ workload, unassigned });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения нагрузки' });
    }
});

// ─────────────────────────────────────────────
// СТАТИСТИКА ПО КЛИНИКЕ/ЗАКАЗЧИКУ
// GET /api/crm/clients/:id/stats
// ─────────────────────────────────────────────
router.get('/clients/:id/stats', authenticateToken, async (req, res) => {
    try {
        const patientId = parseInt(req.params.id);
        const patient = await prisma.patient.findUnique({ where: { id: patientId } });
        if (!patient) return res.status(404).json({ error: 'Клиент не найден' });

        const cases = await prisma.case.findMany({
            where: { patientId },
            include: { transactions: true }
        });

        const totalCases = cases.length;
        const activeCases = cases.filter(c => c.status !== 'ready').length;
        const completedCases = cases.filter(c => c.status === 'ready').length;
        const totalBilledUSD = cases.reduce((s, c) => s + c.totalCost, 0);
        const totalPaidUSD = cases.reduce((s, c) => {
            return s + c.transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + (t.amountUSD || 0), 0);
        }, 0);
        const debtUSD = Math.max(0, totalBilledUSD - totalPaidUSD);

        const now = new Date();
        const overdueCases = cases.filter(c => c.status !== 'ready' && c.dueDate && c.dueDate < now).length;

        res.json({
            patient,
            totalCases,
            activeCases,
            completedCases,
            overdueCases,
            totalBilledUSD: Math.round(totalBilledUSD * 100) / 100,
            totalPaidUSD: Math.round(totalPaidUSD * 100) / 100,
            debtUSD: Math.round(debtUSD * 100) / 100
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка получения статистики клиента' });
    }
});

// ─────────────────────────────────────────────
// ОТЧЁТ ЗА ПЕРИОД
// GET /api/crm/report?from=2024-01-01&to=2024-01-31
// ─────────────────────────────────────────────
router.get('/report', authenticateToken, async (req, res) => {
    if (!['admin', 'accountant'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Доступ запрещен' });
    }
    try {
        const { from, to } = req.query;
        const dateFilter = {};
        if (from) dateFilter.gte = new Date(from);
        if (to) dateFilter.lte = new Date(to);

        const whereDate = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

        const cases = await prisma.case.findMany({
            where: whereDate,
            include: {
                patient: { select: { name: true } },
                doctor: { select: { name: true } },
                tech: { select: { name: true } },
                transactions: true
            },
            orderBy: { createdAt: 'desc' }
        });

        const totalRevenue = cases.reduce((sum, c) => {
            return sum + c.transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amountUSD || 0), 0);
        }, 0);
        const totalBilled = cases.reduce((s, c) => s + c.totalCost, 0);
        const completedCount = cases.filter(c => c.status === 'ready').length;

        const txFilter = Object.keys(dateFilter).length ? { date: dateFilter } : {};
        const expenses = await prisma.transaction.aggregate({
            where: { ...txFilter, type: 'expense' },
            _sum: { amountUSD: true, amountUZS: true }
        });

        res.json({
            period: { from: from || null, to: to || null },
            casesTotal: cases.length,
            casesCompleted: completedCount,
            totalBilledUSD: Math.round(totalBilled * 100) / 100,
            totalCollectedUSD: Math.round(totalRevenue * 100) / 100,
            totalExpensesUSD: Math.round((expenses._sum.amountUSD || 0) * 100) / 100,
            profitUSD: Math.round((totalRevenue - (expenses._sum.amountUSD || 0)) * 100) / 100,
            cases
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка формирования отчёта' });
    }
});

module.exports = router;
