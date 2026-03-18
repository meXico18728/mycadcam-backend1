const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function backfill() {
    const transactions = await prisma.transaction.findMany({
        where: { caseId: { not: null }, patientId: null }
    });

    for (const t of transactions) {
        const c = await prisma.case.findUnique({ where: { id: t.caseId } });
        if (c) {
            await prisma.transaction.update({
                where: { id: t.id },
                data: { patientId: c.patientId }
            });
            console.log(`Updated transaction ${t.id} with patientId ${c.patientId}`);
        }
    }
}

backfill().catch(console.error).finally(() => prisma.$disconnect());
