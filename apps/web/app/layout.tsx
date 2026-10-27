import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "A11yForge",
  description: "Autonomous accessibility engineering. Hackathon development build.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="site-wordmark">
              A11yForge
            </Link>
            <SiteNav />
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="site-footer-inner">
            <span>Find. Fix. Prove accessibility.</span>
            <span>
              <Link href="/console#h-evidence">Developer details</Link>
              {" · "}
              <Link href="/connect">Connect your code</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
