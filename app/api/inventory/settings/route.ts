import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { z } from "zod";

const Body = z.object({
  secret: z.string(),
  // YYYY-MM-DD oder leer/null zum Löschen
  defaultFrom: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (v) => v == null || v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v),
      "defaultFrom must be YYYY-MM-DD"
    ),
});

function toDateOrNull(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

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

  const d = toDateOrNull(parsed.data.defaultFrom ?? null);

  const row = await prisma.inventorySettings.upsert({
    where: { id: "default" },
    update: { defaultFrom: d },
    create: { id: "default", defaultFrom: d },
  });

  return NextResponse.json({
    ok: true,
    defaultFrom: row.defaultFrom ? row.defaultFrom.toISOString().slice(0, 10) : null,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  if (!process.env.SCAN_SECRET || secret !== process.env.SCAN_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const row = await prisma.inventorySettings.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    ok: true,
    defaultFrom: row?.defaultFrom ? row.defaultFrom.toISOString().slice(0, 10) : null,
  });
}
