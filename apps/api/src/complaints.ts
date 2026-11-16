import { BadRequestException, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { db, transaction } from "./db";

const statuses = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
const statusInput = z.enum(statuses);
const idInput = z.coerce.number().int().positive().max(2_147_483_647);
const pageSize = 20;
type Actor = { id: string; name: string };

export async function listComplaints(input: unknown) {
  const query = z
    .object({
      status: statusInput.optional(),
      search: z.string().trim().max(191).optional(),
      page: z.coerce.number().int().min(1).max(100_000).default(1),
    })
    .parse(input);
  const search = query.search;
  const radicado = /^\d+$/.test(search ?? "")
    ? idInput.safeParse(search)
    : undefined;
  const where = {
    status: query.status,
    OR: search
      ? [
          { email: { contains: search } },
          { subject: { contains: search } },
          ...(radicado?.success ? [{ id: radicado.data }] : []),
        ]
      : undefined,
  };
  const [rows, total] = await db.$transaction([
    db.complaint.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        subject: true,
        status: true,
        receivedAt: true,
      },
    }),
    db.complaint.count({ where }),
  ]);
  return { rows, total, pageSize };
}

export async function getComplaint(rawId: string) {
  const complaint = await db.complaint.findUnique({
    where: { id: idInput.parse(rawId) },
    include: { events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  if (!complaint) throw new NotFoundException("Reclamo no encontrado");
  return complaint;
}

export async function createComplaint(actor: Actor, input: unknown) {
  const data = z
    .object({
      email: z.string().trim().email().max(191),
      subject: z.string().trim().min(3).max(191),
      description: z.string().trim().min(5).max(4000),
      receivedAt: z.string().datetime(),
    })
    .parse(input);
  const receivedAt = new Date(data.receivedAt);
  if (receivedAt.getTime() > Date.now())
    throw new BadRequestException(
      "La fecha de recepción no puede estar en el futuro",
    );
  return db.complaint.create({
    data: {
      ...data,
      receivedAt,
      events: {
        create: {
          actorId: actor.id,
          actorName: actor.name,
          status: "OPEN",
          note: "Reclamo registrado",
        },
      },
    },
  });
}

export async function addComplaintEvent(
  actor: Actor,
  rawId: string,
  input: unknown,
) {
  const id = idInput.parse(rawId);
  const event = z
    .object({
      status: statusInput,
      previousStatus: statusInput,
      note: z.string().trim().min(3).max(4000),
    })
    .parse(input);
  return transaction(async (tx) => {
    const current = await tx.complaint.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) throw new NotFoundException("Reclamo no encontrado");
    if (current.status !== event.previousStatus)
      throw new BadRequestException(
        "El reclamo cambió. Actualiza su ficha antes de guardar.",
      );
    await tx.complaint.update({
      where: { id },
      data: {
        status: event.status,
        events: {
          create: {
            status: event.status,
            note: event.note,
            actorId: actor.id,
            actorName: actor.name,
          },
        },
      },
    });
    return { id };
  });
}
