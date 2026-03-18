import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import LiveClock from "../../components/Dashboard/LiveClock";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="global-header">
        <Link href="/" className="global-logo">
          <Image
            src="/logo.png"
            alt="PrimeSolution"
            width={32}
            height={15}
            priority
          />
          <span className="global-logo-text">PRIMESOLUTION</span>
        </Link>

        <div className="global-header-right">
          <LiveClock />
          <Link href="/login" className="header-profile-btn" title="프로필">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </Link>
        </div>
      </header>
      <div className="global-content">{children}</div>
    </>
  );
}
