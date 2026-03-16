import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { z } from "zod";

const ItemSchema = z.object({
  baseType: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(120),
  size: z.string().trim().min(1).max(60),
  startQty: z.coerce.number().int().min(0),
});

const Body = z.object({
  items: z.array(ItemSchema).min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  updateDate: z.boolean().default(false),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const { items, date, updateDate } = parsed.data;

  // Save all inventory items (parallel)
  await Promise.all(
    items.map((item) =>
      prisma.inventoryStart.upsert({
        where: {
          baseType_category_size: {
            baseType: item.baseType,
            category: item.category,
            size: item.size,
          },
        },
        update: { startQty: item.startQty },
        create: {
          baseType: item.baseType,
          category: item.category,
          size: item.size,
          startQty: item.startQty,
        },
      })
    )
  );

  if (updateDate) {
    const today = new Date().toISOString().slice(0, 10);
    const fromISO = date ?? today;
    const fromDate = new Date(`${fromISO}T00:00:00.000Z`);
    await prisma.inventorySettings.upsert({
      where: { id: "default" },
      update: { defaultFrom: fromDate },
      create: { id: "default", defaultFrom: fromDate },
    });
  }

  return NextResponse.json({ ok: true, savedCount: items.length });
}
