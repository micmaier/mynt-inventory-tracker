import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";

export async function GET() {
  const settings = await prisma.inventorySettings.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    ok: true,
    defaultFrom: settings?.defaultFrom?.toISOString().slice(0, 10) ?? null,
    updatedAt: settings?.updatedAt?.toISOString() ?? null,
  });
}
