"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/bestand", label: "Bestand" },
  { href: "/inventory", label: "Bewegungen" },
  { href: "/scanned-orders", label: "Scanned Orders" },
];

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "10px 24px",
        borderBottom: "1px solid #e5e5e5",
        background: "#fff",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, marginRight: 16, color: "#111" }}>
        Mynt
      </div>
      {links.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: active ? 600 : 400,
              background: active ? "#111" : "transparent",
              color: active ? "#fff" : "#555",
              fontSize: 14,
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
