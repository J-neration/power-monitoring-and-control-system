"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import LogoutButton from "./LogoutButton";

const ADMIN_LINKS = [
  { href: "/admin/sites", label: "현장 관리" },
  { href: "/admin/registry", label: "마스터 데이터" },
  { href: "/admin/users", label: "유저 관리" },
  { href: "/admin/manual", label: "관리자 매뉴얼" },
];

type HeaderMenuProps = {
  roleLabel: string | null;
  displayName: string | null;
  isAdmin: boolean;
};

export default function HeaderMenu({
  roleLabel,
  displayName,
  isAdmin,
}: HeaderMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  const panel = (
    <>
      <div
        className={`header-side-backdrop${open ? " is-open" : ""}`}
        onClick={close}
        aria-hidden
      />
      <aside
        id="header-side-panel"
        className={`header-side${open ? " is-open" : ""}`}
        aria-hidden={!open}
        inert={open ? undefined : true}
      >
        {roleLabel || displayName ? (
          <div className="header-side-account">
            {roleLabel ? (
              <span className="header-user-role">{roleLabel}</span>
            ) : null}
            {displayName ? <strong>{displayName}</strong> : null}
          </div>
        ) : null}

        {isAdmin ? (
          <nav className="header-side-nav" aria-label="관리">
            <p className="header-side-label">관리</p>
            {ADMIN_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  pathname.startsWith(item.href) ? "is-active" : undefined
                }
                onClick={close}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="header-side-contact">
          <p className="header-side-label">문의</p>
          <a href="tel:031-464-105">031-464-105</a>
          <a href="mailto:SPD@primepowersolutions.com">
            SPD@primepowersolutions.com
          </a>
        </div>

        <LogoutButton active={open} />

        <p className="header-side-copy">
          &copy; {new Date().getFullYear()} PrimeSolution. All rights reserved.
        </p>
      </aside>
    </>
  );

  return (
    <>
      <button
        type="button"
        className={`header-profile-btn header-menu-btn${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls="header-side-panel"
        aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        )}
      </button>
      {mounted ? createPortal(panel, document.body) : null}
    </>
  );
}
