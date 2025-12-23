import { prisma } from "./db";
import { fetchProductTags, productFetchLimit } from "./shopify";

export type BaseType = "P" | "U";
export type Category = "Wandfarbe" | "Lack";
export const ALLOWED_SIZES = ["10 Liter", "2.5 Liter", "1 Liter", "0.75 Liter", "0.375 Liter"] as const;
export type Size = typeof ALLOWED_SIZES[number];

type LineItem = {
  product_id?: number | null;
  name: string;
  variant_title: string | null;
  quantity: number;
  properties?: Array<{ name: string; value: string }>;
};

export function detectCategory(text: string): Category | null {
  const t = text.toLowerCase();
  if (t.includes("wandfarbe")) return "Wandfarbe";
  if (t.includes("lack")) return "Lack";
  return null;
}

export function detectSize(text: string): Size | null {
  for (const s of ALLOWED_SIZES) {
    if (text.includes(s)) return s;
  }
  return null;
}

export function isCustomColor(li: LineItem): boolean {
  const a = li.name?.toLowerCase() || "";
  const b = li.variant_title?.toLowerCase() || "";
  return a.includes("custom color") || b.includes("custom color");
}

export function detectPigmentOption(li: LineItem): "P1" | "P2" | "P3" | "P4" | null {
  const hay = `${li.name ?? ""} ${li.variant_title ?? ""}`;
  const m = hay.match(/\bP[1-4]\b/);
  if (m) return m[0] as any;

  if (li.properties?.length) {
    for (const p of li.properties) {
      const v = `${p.name} ${p.value}`.match(/\bP[1-4]\b/);
      if (v) return v[0] as any;
    }
  }
  return null;
}

export async function getBaseTypeFromProductTags(productId: string): Promise<BaseType | null> {
  const cached = await prisma.productBaseTagCache.findUnique({ where: { productId } });
  const fresh =
    cached && Date.now() - new Date(cached.updatedAt).getTime() < 1000 * 60 * 60 * 24 * 7;

  if (fresh) return (cached!.baseType as BaseType | null) ?? null;

  const tagsRaw = await productFetchLimit(() => fetchProductTags(productId));
  const tags = (tagsRaw || "").toLowerCase();

  let baseType: BaseType | null = null;
  if (tags.includes("base p")) baseType = "P";
  else if (tags.includes("base u")) baseType = "U";

  await prisma.productBaseTagCache.upsert({
    where: { productId },
    update: { tagsRaw, baseType },
    create: { productId, tagsRaw, baseType },
  });

  return baseType;
}

export function baseTypeFromCustomColor(li: LineItem): BaseType | null {
  const p = detectPigmentOption(li);
  if (!p) return null;
  return p === "P1" ? "P" : "U";
}

export async function classifyLineItem(
  li: LineItem
): Promise<{ baseType: BaseType; category: Category; size: Size } | null> {
  const text = `${li.name ?? ""} ${li.variant_title ?? ""}`;

  const category = detectCategory(text);
  if (!category) return null;

  const size = detectSize(text);
  if (!size) return null;

  if (isCustomColor(li)) {
    const baseType = baseTypeFromCustomColor(li);
    if (!baseType) return null;
    return { baseType, category, size };
  }

  if (!li.product_id) return null;
  const baseType = await getBaseTypeFromProductTags(String(li.product_id));
  if (!baseType) return null;

  return { baseType, category, size };
}
