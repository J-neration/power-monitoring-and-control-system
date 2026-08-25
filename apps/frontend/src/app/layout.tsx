import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";

const logoFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--font-logo",
});

export const metadata: Metadata = {
  title: {
    default: "PrimeSolution PMCS",
    template: "%s | PMCS",
  },
  description: "Power Monitoring and Control System",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={logoFont.variable}>
      <body>{children}</body>
    </html>
  );
}
