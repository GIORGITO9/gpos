import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
async function main() {
  const db = new PrismaClient();
  if (
    !process.env.ADMIN_EMAIL ||
    !process.env.ADMIN_PASSWORD ||
    process.env.ADMIN_PASSWORD.length < 12
  )
    throw new Error(
      "Configura ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 12 caracteres)",
    );
  await db.user.create({
    data: {
      name: "Administrador de plataforma",
      email: process.env.ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12),
      role: "SUPER_ADMIN",
      permissions: [],
    },
  });
  await db.$disconnect();
}
main();
