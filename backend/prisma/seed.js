const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('operador123', 10);

  const operators = [
    { username: 'carlos', displayName: 'Carlos', passwordHash: password, role: 'operator' },
    { username: 'maria',  displayName: 'María',  passwordHash: password, role: 'operator' },
    { username: 'juan',   displayName: 'Juan',   passwordHash: password, role: 'operator' },
    { username: 'ana',    displayName: 'Ana',    passwordHash: password, role: 'operator' },
  ];

  for (const op of operators) {
    await prisma.user.upsert({
      where: { username: op.username },
      update: {},
      create: op,
    });
  }

  console.log('✓ 4 operadores creados (contraseña: operador123)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
