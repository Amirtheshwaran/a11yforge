"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Check a website" },
  { href: "/console", label: "Example" },
  { href: "/console#h-evidence", label: "Developer details" },
] as const;

export function SiteNav(): React.JSX.Element {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="site-nav">
      {LINKS.map((link) => {
        const active =
          link.href === "/"
            ? pathname === "/"
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
