import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { z } from "zod";

const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const fromDate = new Date(`${parsed.data.date}T00:00:00.000Z`);
  await prisma.inventorySettings.upsert({
    where: { id: "default" },
    update: { defaultFrom: fromDate },
    create: { id: "default", defaultFrom: fromDate },
  });

  return NextResponse.json({ ok: true });
}
