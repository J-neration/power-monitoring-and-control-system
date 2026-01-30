import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "PMCS Dashboard",
  description: "HDMI monitoring and control",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
