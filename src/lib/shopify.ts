import pLimit from "p-limit";

const SHOP = process.env.SHOPIFY_STORE_DOMAIN!;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const API_VER = process.env.SHOPIFY_API_VERSION || "2024-10";

type ShopifyOrder = {
  id: number;
  created_at: string;
  email?: string | null;
  line_items: Array<{
    id: number;
    product_id?: number | null;
    variant_id?: number | null;
    name: string;
    variant_title: string | null;
    quantity: number;
    properties?: Array<{ name: string; value: string }>;
  }>;
};

type ShopifyProduct = {
  product: { id: number; tags: string };
};

export async function fetchPaidOrders(): Promise<ShopifyOrder[]> {
  const baseUrl = `https://${SHOP}/admin/api/${API_VER}/orders.json`;
  const params = new URLSearchParams({
    status: "any",
    financial_status: "paid",
    limit: "250",
  });

  const res = await fetch(`${baseUrl}?${params.toString()}`, {
    headers: { "X-Shopify-Access-Token": TOKEN },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shopify orders fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return (data.orders || []) as ShopifyOrder[];
}

export async function fetchProductTags(productId: string): Promise<string> {
  const url = `https://${SHOP}/admin/api/${API_VER}/products/${productId}.json?fields=id,tags`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": TOKEN },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Shopify product fetch failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as ShopifyProduct;
  return data.product?.tags ?? "";
}

export const productFetchLimit = pLimit(3);
