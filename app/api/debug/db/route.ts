import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.DATABASE_URL || "(undefined)";

  const count = await prisma.inventoryMovement.count();

  const top = await prisma.inventoryMovement.groupBy({
    by: ["baseType", "category", "size"],
    _sum: { qtyUsed: true },
    orderBy: { _sum: { qtyUsed: "desc" } },
    take: 5,
  });

  return NextResponse.json({ DATABASE_URL: url, count, top });
}
