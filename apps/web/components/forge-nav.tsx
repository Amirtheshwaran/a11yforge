"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Scan a site" },
  { href: "/console", label: "Demo" },
] as const;

const GITHUB_URL = "https://github.com/Amirtheshwaran/a11yforge";

/** Thin restrained top navigation: wordmark left, three links right. */
export function ForgeNav(): React.JSX.Element {
  const pathname = usePathname();
  return (
    <header className="forge-nav">
      <div className="forge-nav-inner">
        <Link href="/" className="forge-wordmark" aria-label="A11yForge home">
          <span className="forge-wordmark-mark" aria-hidden="true" />
          A11yForge
        </Link>
        <nav aria-label="Primary" className="forge-nav-links">
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
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
