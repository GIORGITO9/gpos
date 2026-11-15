export function orderRounds(order: any) {
  if (!order.rounds?.length)
    return [
      {
        id: undefined as string | undefined,
        sequence: 1,
        status: order.status as string,
        createdAt: order.createdAt as string,
        items: order.items as any[],
      },
    ];
  return order.rounds
    .map(
      (round: {
        id: string;
        sequence: number;
        status: string;
        createdAt: string;
      }) => ({
        ...round,
        items: order.items.filter(
          (item: any) => item.roundId === round.id,
        ) as any[],
      }),
    )
    .filter((round: { items: any[] }) => round.items.length) as Array<{
    id: string | undefined;
    sequence: number;
    status: string;
    createdAt: string;
    items: any[];
  }>;
}

export function preparationAction(status: string) {
  if (status === "CONFIRMADO")
    return { next: "EN_PREPARACION", label: "Empezar preparación" };
  if (status === "EN_PREPARACION")
    return { next: "LISTO", label: "Marcar listo" };
  if (status === "LISTO" || status === "EN_CAMINO")
    return { next: "ENTREGADO", label: "Marcar entregado" };
  return null;
}
