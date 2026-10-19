import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SGX StatArb Engine",
  description: "Pairs trading & cointegration backtester for DBS, OCBC and UOB",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-page font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
