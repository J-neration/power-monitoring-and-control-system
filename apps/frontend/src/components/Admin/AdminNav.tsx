"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const NAV_ITEMS = [
  {
    href: "/admin/sites",
    label: "현장 관리",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    href: "/admin/users",
    label: "유저 관리",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="7" r="4" />
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
      </svg>
    ),
  },
  {
    href: "/admin/manual",
    label: "관리자 매뉴얼",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
];

const MenuIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="20" y2="18" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default function AdminNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    document.documentElement.classList.add("admin-nav-drawer-open");
    document.body.classList.add("admin-nav-drawer-open");
    return () => {
      document.documentElement.classList.remove("admin-nav-drawer-open");
      document.body.classList.remove("admin-nav-drawer-open");
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, closeMenu]);

  return (
    <>
      <div className="admin-nav-mobile-bar">
        <button
          type="button"
          className="admin-nav-menu-btn"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-controls="admin-nav-panel"
          aria-label="관리 메뉴 열기"
        >
          <MenuIcon />
        </button>
        <span className="admin-nav-mobile-title">관리자 패널</span>
      </div>

      <button
        type="button"
        className={`admin-nav-backdrop${menuOpen ? " is-visible" : ""}`}
        tabIndex={menuOpen ? 0 : -1}
        aria-hidden={!menuOpen}
        aria-label="메뉴 닫기"
        onClick={closeMenu}
      />

      <aside
        id="admin-nav-panel"
        className={`admin-nav${menuOpen ? " admin-nav--open" : ""}`}
      >
        <div className="admin-nav-header">
          <span className="admin-nav-badge">ADMIN</span>
          <span className="admin-nav-title">관리자 패널</span>
          <button
            type="button"
            className="admin-nav-close-btn"
            onClick={closeMenu}
            aria-label="메뉴 닫기"
          >
            <CloseIcon />
          </button>
        </div>
        <nav className="admin-nav-list" aria-label="관리자 메뉴">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-item${active ? " active" : ""}`}
                onClick={closeMenu}
              >
                <span className="admin-nav-icon">{item.icon}</span>
                <span className="admin-nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
