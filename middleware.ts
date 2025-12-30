import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function html(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // ✅ API & Assets nicht blockieren
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const password = process.env.APP_PASSWORD;
  if (!password) return new NextResponse("APP_PASSWORD not set", { status: 500 });

  // ✅ Logout
  if (searchParams.get("logout") === "1") {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set("inventory_auth", "", { path: "/", maxAge: 0 });
    return res;
  }

  const cookie = req.cookies.get("inventory_auth")?.value;

  // ✅ Eingeloggt, wenn Cookie == "ok"
  if (cookie === "ok") {
    return NextResponse.next();
  }

  const pw = searchParams.get("pw") ?? "";

  // ✅ Passwort korrekt → Cookie setzen und Redirect (ohne pw in URL)
  if (pw === password) {
    const cleanUrl = new URL(req.nextUrl.pathname, req.url);
    const res = NextResponse.redirect(cleanUrl);
    res.cookies.set("inventory_auth", "ok", {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 Tage
    });
    return res;
  }

  const error = pw ? `<div style="color:#b00020;margin-top:10px;">Falsches Passwort.</div>` : "";

  return html(`
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Inventory geschützt</title>
</head>
<body style="margin:0;background:#0b0b0f;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
    <div style="width:100%;max-width:420px;background:#12121a;border:1px solid #2a2a3a;border-radius:14px;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.35)">
      <div style="font-size:18px;font-weight:700;margin-bottom:6px">🔒 Inventory geschützt</div>
      <div style="font-size:13px;color:#b7b7c7;margin-bottom:14px">Bitte Passwort eingeben, um fortzufahren.</div>

      <form method="GET" style="display:flex;gap:10px;align-items:center">
        <input
          type="password"
          name="pw"
          autofocus
          placeholder="Passwort"
          style="flex:1;padding:10px 12px;border-radius:10px;border:1px solid #2a2a3a;background:#0f0f16;color:#fff;outline:none"
        />
        <button
          style="padding:10px 14px;border-radius:10px;border:1px solid #2a2a3a;background:#1f1f2a;color:#fff;cursor:pointer;font-weight:600"
        >Login</button>
      </form>
      ${error}

      <div style="margin-top:14px;font-size:12px;color:#8f8fa3">
        Tipp: Wenn du “immer reinkommst”, hast du vermutlich noch ein Login-Cookie. Teste Inkognito oder Logout:
        <a href="?logout=1" style="color:#c7c7ff">Logout</a>
      </div>
    </div>
  </div>
</body>
</html>
  `, pw ? 401 : 200);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
