const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('=== TRANSACTIONS ===');
    const tx = await prisma.transaction.findMany();
    console.log(JSON.stringify(tx, null, 2));

    console.log('\n=== PATIENTS with CASES ===');
    const patients = await prisma.patient.findMany({
        include: { cases: true, transactions: true }
    });
    for (const p of patients) {
        const totalDebt = p.cases.reduce((s, c) => s + ((c.totalCost || 0) - (c.paidAmount || 0)), 0);
        console.log(`Patient #${p.id} "${p.name}" | cases: ${p.cases.length} | transactions: ${p.transactions.length} | totalDebt: ${totalDebt}`);
        p.cases.forEach(c => {
            console.log(`  Case #${c.id} totalCost=${c.totalCost} paidAmount=${c.paidAmount}`);
        });
        p.transactions.forEach(t => {
            console.log(`  Tx #${t.id} type=${t.type} amount=${t.amountUSD} date=${t.date}`);
        });
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
