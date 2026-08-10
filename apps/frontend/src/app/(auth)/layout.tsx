import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "로그인" };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="auth-layout">{children}</div>;
}
