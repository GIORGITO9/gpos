import { BadRequestException, ConflictException } from "@nestjs/common";
import { z } from "zod";

export const productSelection = z
  .array(
    z.object({
      id: z.string().min(1),
      quantity: z.number().int().min(1).max(999),
    }),
  )
  .min(1)
  .max(500);

type Line = {
  id: string;
  name: string;
  quantity: number;
  total: number;
  settlementTotal: number | null;
};
type Payment = { amount: number; items?: unknown };
type Account = { total: number; items: Line[]; payments: Payment[] };

export function share(total: number, units: number, all: number) {
  return Number((BigInt(total) * BigInt(units)) / BigInt(all));
}

// Cumulative rounding assigns every peso once, including discounts, tax and tip.
export function allocateTotal(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let used = 0;
  return weights.map((weight, index) => {
    const start = used;
    used += weight;
    return sum
      ? share(total, used, sum) - share(total, start, sum)
      : share(total, index + 1, weights.length) -
          share(total, index, weights.length);
  });
}

export function settlementLines(order: Account) {
  const lines = [...order.items].sort((a, b) => a.id.localeCompare(b.id));
  const totals = allocateTotal(
    order.total,
    lines.map((line) => line.total),
  );
  return lines.map((line, index) => ({
    ...line,
    settlementTotal: line.settlementTotal ?? totals[index],
  }));
}

export function quoteProducts(
  order: Account,
  selected: z.infer<typeof productSelection>,
) {
  const lines = settlementLines(order);
  const previous = paidProductQuantities(order);
  validateProductSelection(lines, previous, selected);
  const items = [...selected]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, quantity }) => {
      const line = lines.find((item) => item.id === id)!;
      const paidUnits = previous.get(id) ?? 0;
      const amount =
        share(line.settlementTotal, paidUnits + quantity, line.quantity) -
        share(line.settlementTotal, paidUnits, line.quantity);
      return { id, quantity, name: line.name, amount };
    });
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const paid = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const amount = Math.min(total, order.total - paid);
  if (amount <= 0)
    throw new BadRequestException("La selección no tiene un importe pendiente");
  return { items, amount, credit: total - amount, paid };
}

export function paidProductQuantities(order: Account) {
  const previous = new Map<string, number>();
  for (const payment of order.payments) {
    for (const item of Array.isArray(payment.items) ? payment.items : [])
      previous.set(item.id, (previous.get(item.id) ?? 0) + item.quantity);
  }
  return previous;
}

export function validateProductSelection(
  lines: Line[],
  previous: ReadonlyMap<string, number>,
  selected: z.infer<typeof productSelection>,
) {
  if (new Set(selected.map((item) => item.id)).size !== selected.length)
    throw new BadRequestException("Agrupa las cantidades del mismo producto");
  for (const { id, quantity } of selected) {
    const line = lines.find((item) => item.id === id);
    if (!line || (previous.get(id) ?? 0) + quantity > line.quantity)
      throw new ConflictException(
        "Algunos productos ya se cobraron o cambiaron de cantidad",
      );
  }
}
