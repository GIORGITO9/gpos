import "dotenv/config";
import { PrismaClient } from "@prisma/client";
async function main() {
  const db = new PrismaClient();
  try {
    const now = new Date();
    const expired = await db.subscription.findMany({
      where: { status: "TRIAL", renewsAt: { lt: now } },
    });
    for (const sub of expired)
      await db.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: "SUSPENDIDA",
            events: { create: { action: "TRIAL_EXPIRED" } },
          },
        });
        await tx.notification.create({
          data: {
            tenantId: sub.tenantId,
            title:
              "Tu período de prueba ha finalizado. Contacta al administrador para activar tu suscripción.",
          },
        });
      });
    await db.refreshSession.deleteMany({ where: { expiresAt: { lt: now } } });
    await db.passwordReset.deleteMany({ where: { expiresAt: { lte: now } } });
    await db.trustedDevice.deleteMany({ where: { expiresAt: { lte: now } } });
    await db.loginChallenge.deleteMany({ where: { expiresAt: { lte: now } } });
    await db.loginAttempt.deleteMany({ where: { windowEnds: { lte: now } } });
    console.log(
      JSON.stringify({
        expiredTrials: expired.length,
        completedAt: now.toISOString(),
      }),
    );
  } finally {
    await db.$disconnect();
  }
}
main();
