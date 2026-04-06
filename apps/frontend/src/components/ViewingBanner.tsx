"use client";

import { useEffect } from "react";

/** How long (ms) the banner stays visible before auto-dismissing. */
const AUTO_DISMISS_MS = 8_000;

type Props = {
  onDismiss: () => void;
};

const InfoIcon = () => (
  <svg
    className="viewing-banner-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * Informational banner shown when the user begins actively viewing a device.
 * Auto-dismisses after AUTO_DISMISS_MS or when the user clicks the close button.
 */
export default function ViewingBanner({ onDismiss }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="viewing-banner" role="status" aria-live="polite">
      <div className="viewing-banner-body">
        <InfoIcon />
        <div className="viewing-banner-text">
          <span className="viewing-banner-title">실시간 모니터링 중</span>
          <span className="viewing-banner-desc">
            장치 상태와 원격 명령은 이 화면에 반영되기까지 최대{" "}
            <strong>60초</strong> 걸릴 수 있습니다.
          </span>
        </div>
      </div>
      <button
        type="button"
        className="viewing-banner-close"
        onClick={onDismiss}
        aria-label="닫기"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
