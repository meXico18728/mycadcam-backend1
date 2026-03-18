const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const patientIds = [2, 3];
const restorations = [
    { name: 'Коронка Emax', priceUSD: 15 },
    { name: 'Коронка из диоксида циркония', priceUSD: 18 },
    { name: 'Винир Emax', priceUSD: 16 },
    { name: 'Вкладка керамическая', priceUSD: 14 },
    { name: 'Титановая балка опора', priceUSD: 15 },
    { name: 'Титановая балка промежуток', priceUSD: 10 },
];
const statuses = ['new', 'modeling', 'processing', 'ready'];

const allTeeth = Array.from({ length: 32 }, (_, i) => i + 1);

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function randomTeeth() {
    const count = randInt(1, 4);
    const shuffled = [...allTeeth].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function randomDate(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - randInt(0, daysAgo));
    return d;
}

async function main() {
    const cases = [];

    for (let i = 0; i < 50; i++) {
        const patientId = pick(patientIds);
        const resto = pick(restorations);
        const teeth = randomTeeth();
        const totalCost = resto.priceUSD * teeth.length;
        const status = statuses[Math.floor(i / 13)] || pick(statuses); // равномерное распределение

        // Варианты погашения: не оплачен, частично, полностью
        const paymentVariant = i % 3;
        let paidAmount = 0;
        if (paymentVariant === 1) paidAmount = parseFloat((totalCost * (Math.random() * 0.7 + 0.1)).toFixed(2)); // 10-80%
        if (paymentVariant === 2) paidAmount = totalCost; // полностью

        cases.push({
            patientId,
            toothFormula: JSON.stringify({ teeth, type: resto.name }),
            totalCost,
            paidAmount,
            status,
            doctorId: 1,
            createdAt: randomDate(180),
        });
    }

    for (const c of cases) {
        await p.case.create({ data: c });
    }

    console.log('✓ 50 кейсов создано');
}

main().catch(console.error).finally(() => p.$disconnect());
