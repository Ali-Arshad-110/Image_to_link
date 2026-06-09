const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.log("Starting database connection test...");
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  try {
    const start = Date.now();
    const result = await prisma.$queryRaw`SELECT 1 as result`;
    console.log(`Connection successful in ${Date.now() - start}ms!`);
    console.log("QueryResult:", result);
  } catch (error) {
    console.error("Database connection test failed:");
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
