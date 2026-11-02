import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import ClearTransientRetry from "../components/ClearTransientRetry";

// next/font/google fetches fonts.googleapis.com at build time. Google sometimes
// returns extensionless /l/font URLs, and Next 14.1 then crashes the build.
const logoFont = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-600.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-logo",
});

export const metadata: Metadata = {
  title: {
    default: "PrimeSolution PQMS",
    template: "%s | PQMS",
  },
  description: "Power Monitoring and Control System",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={logoFont.variable}>
      <body>
        <ClearTransientRetry />
        {children}
      </body>
    </html>
  );
}
