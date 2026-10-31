import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ForgeNav } from "@/components/forge-nav";
import "./globals.css";
import "./spatial.css";
import "./tour.css";

export const metadata: Metadata = {
  title: "A11yForge — See what your users can't",
  description:
    "A11yForge tests your website in a real browser, shows exactly where accessibility problems happen, and can repair supported issues.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <ForgeNav />
        <div id="main-content">{children}</div>
        <footer className="forge-foot">
          <div className="forge-foot-inner">
            <span>Find. Fix. Prove accessibility.</span>
            <span>
              <Link href="/console">Recorded demo</Link>
              {" · "}
              <Link href="/connect">Connect source</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
