const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    const tx = await prisma.transaction.findMany();
    console.log(JSON.stringify(tx, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
