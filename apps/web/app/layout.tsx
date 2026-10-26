import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A11yForge",
  description: "Autonomous accessibility engineering. Hackathon development build.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
