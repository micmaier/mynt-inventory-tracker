import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ❌ API & Assets NICHT blockieren
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("inventory_auth")?.value;
  const password = process.env.APP_PASSWORD;

  // ❌ kein Passwort gesetzt = Konfig-Fehler
  if (!password) {
    return new NextResponse("APP_PASSWORD not set", { status: 500 });
  }

  // ✅ bereits authentifiziert
  if (cookie === password) {
    return NextResponse.next();
  }

  // 🔐 Passwort aus URL (?pw=...)
  const pw = req.nextUrl.searchParams.get("pw");

  if (pw === password) {
    const res = NextResponse.redirect(new URL(req.nextUrl.pathname, req.url));
    res.cookies.set("inventory_auth", password, {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
    });
    return res;
  }

  // 🚫 Blockieren
  return new NextResponse(
    `
    <html>
      <body style="font-family: system-ui; padding: 40px">
        <h2>🔒 Inventory geschützt</h2>
        <form>
          <input type="password" name="pw" placeholder="Passwort" />
          <button>Login</button>
        </form>
      </body>
    </html>
    `,
    { headers: { "Content-Type": "text/html" } }
  );
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
