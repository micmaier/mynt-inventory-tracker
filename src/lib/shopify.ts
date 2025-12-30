import pLimit from "p-limit";

const SHOP = process.env.SHOPIFY_STORE_DOMAIN!;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const API_VER = process.env.SHOPIFY_API_VERSION || "2024-10";

type ShopifyOrder = {
  id: number;
  name?: string; // "#7861" (kommt automatisch mit)
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

// ---------------------------------------------
// helpers
// ---------------------------------------------
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // <url>; rel="next"
  const parts = linkHeader.split(",").map((p) => p.trim());
  for (const p of parts) {
    if (p.includes('rel="next"')) {
      const m = p.match(/<([^>]+)>/);
      return m?.[1] ?? null;
    }
  }
  return null;
}

async function shopifyFetch(url: string, attempt = 0): Promise<Response> {
  const res: Response = await fetch(nextUrl, {
    headers: { "X-Shopify-Access-Token": TOKEN },
    cache: "no-store",
  });

  if (res.status === 429) {
    // Shopify rate limit
    const retryAfter = Number(res.headers.get("Retry-After") || "1");
    const backoff = Math.min(10_000, retryAfter * 1000) + attempt * 300;
    await sleep(backoff);
    return shopifyFetch(url, attempt + 1);
  }

  return res;
}

// ---------------------------------------------
// Orders (PAID) – pagination safe + retry
// ---------------------------------------------
export async function fetchPaidOrders(params?: { createdAtMin?: string }): Promise<ShopifyOrder[]> {
  const baseUrl = `https://${SHOP}/admin/api/${API_VER}/orders.json`;

  const all: ShopifyOrder[] = [];
  let nextUrl: string | null = null;

  // erster Request
  const firstParams = new URLSearchParams({
    status: "any",
    financial_status: "paid",
    limit: "250",
  });

  if (params?.createdAtMin) {
    // Shopify erwartet ISO, z.B. 2025-12-01T00:00:00+00:00
    firstParams.set("created_at_min", params.createdAtMin);
  }

  nextUrl = `${baseUrl}?${firstParams.toString()}`;

  while (nextUrl) {
    const res: Response = await fetch(nextUrl, {
      headers: { "X-Shopify-Access-Token": TOKEN },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Shopify orders fetch failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    all.push(...((data.orders || []) as ShopifyOrder[]));

    // Pagination: Link header auswerten
    const link = res.headers.get("link") || res.headers.get("Link") || "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = m ? m[1] : null;
  }

  return all;
}


// ---------------------------------------------
// Product tags (UNVERÄNDERT)
// ---------------------------------------------
export async function fetchProductTags(productId: string): Promise<string> {
  const url = `https://${SHOP}/admin/api/${API_VER}/products/${productId}.json?fields=id,tags`;
  const res: Response = await fetch(nextUrl, {
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
