const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetDatabase() {
    console.log('Начинаем сброс данных...');

    // Порядок важен: сначала зависимые таблицы
    const deletedAttachments = await prisma.attachment.deleteMany();
    console.log(`Удалено вложений: ${deletedAttachments.count}`);

    const deletedTransactions = await prisma.transaction.deleteMany();
    console.log(`Удалено транзакций: ${deletedTransactions.count}`);

    const deletedCases = await prisma.case.deleteMany();
    console.log(`Удалено заказов: ${deletedCases.count}`);

    const deletedPatients = await prisma.patient.deleteMany();
    console.log(`Удалено заказчиков: ${deletedPatients.count}`);

    console.log('\n✅ Готово! Данные очищены.');
    console.log('Пользователи и прайс-лист сохранены.');
}

resetDatabase().catch(console.error).finally(() => prisma.$disconnect());
