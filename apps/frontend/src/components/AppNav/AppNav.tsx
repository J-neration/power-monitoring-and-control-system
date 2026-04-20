"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import LiveClock from "../Dashboard/LiveClock";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
];

const ACCOUNT_ITEMS = [
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
];

export default function AppNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="app-nav">
      {/* Logo */}
      <Link href="/" className="app-nav-logo">
        <div className="app-nav-logo-icon">
          <Image
            src="/logo.png"
            alt="PrimeSolution"
            width={28}
            height={13}
            priority
          />
        </div>
        <span className="app-nav-logo-text">
          PrimeSolution
          <span className="app-nav-beta-badge">BETA</span>
        </span>
      </Link>

      {/* Main nav items */}
      <div className="app-nav-section">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`app-nav-item${isActive(item.href) ? " active" : ""}`}
          >
            <span className="app-nav-icon">{item.icon}</span>
            <span className="app-nav-label">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* Account section */}
      <div className="app-nav-section app-nav-account">
        <span className="app-nav-section-title">ACCOUNT PAGES</span>
        {ACCOUNT_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            target="_blank"
            className={`app-nav-item${isActive(item.href) ? " active" : ""}`}
          >
            <span className="app-nav-icon">{item.icon}</span>
            <span className="app-nav-label">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* Clock at bottom */}
      <div className="app-nav-footer">
        <span className="app-nav-footer-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </span>
        <span className="app-nav-footer-clock">
          <LiveClock />
        </span>
      </div>
    </nav>
  );
}
