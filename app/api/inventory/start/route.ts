import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { z } from "zod";

const Body = z.object({
  secret: z.string(),

  baseType: z.string().trim().min(1, "baseType required").max(60, "baseType too long"),

  // ✅ vorher: z.enum(["Wandfarbe","Lack"])
  category: z.string().trim().min(1, "category required").max(120, "category too long"),

  // ✅ vorher: z.enum(ALLOWED_SIZES)
  size: z.string().trim().min(1, "size required").max(60, "size too long"),

  // ✅ FIX: akzeptiert auch "12" als 12
  startQty: z.coerce.number().int().min(0),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  if (!process.env.SCAN_SECRET) {
    return NextResponse.json({ ok: false, error: "SCAN_SECRET missing" }, { status: 500 });
  }
  if (parsed.data.secret !== process.env.SCAN_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { baseType, category, size, startQty } = parsed.data;

  const row = await prisma.inventoryStart.upsert({
    where: { baseType_category_size: { baseType, category, size } },
    update: { startQty },
    create: { baseType, category, size, startQty },
  });

  return NextResponse.json({ ok: true, row });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  if (!process.env.SCAN_SECRET || secret !== process.env.SCAN_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.inventoryStart.findMany({
    orderBy: [{ baseType: "asc" }, { category: "asc" }, { size: "asc" }],
  });

  return NextResponse.json({ ok: true, rows });
}
