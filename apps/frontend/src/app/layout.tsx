import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import LiveClock from "../components/Dashboard/LiveClock";

export const metadata: Metadata = {
  title: "PrimeSolution PMCS",
  description: "Power Monitoring and Control System",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="global-header">
          <Link href="/" className="global-logo">
            <Image src="/logo.png" alt="PrimeSolution" width={32} height={20} priority />
            <span className="global-logo-text">PRIMESOLUTION</span>
          </Link>
          <LiveClock />
        </header>
        <div className="global-content">{children}</div>
      </body>
    </html>
  );
}
