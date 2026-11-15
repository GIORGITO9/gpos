import { PrismaClient, Prisma } from "@prisma/client";
export const db = new PrismaClient();
export async function transaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 4; i++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        maxWait: 10000,
        timeout: 20000,
      });
    } catch (e: any) {
      if (e.code === "P2034" && i < 3) continue;
      throw e;
    }
  }
  throw new Error("Transaction retry exhausted");
}
