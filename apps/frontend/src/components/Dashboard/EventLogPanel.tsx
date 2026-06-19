"use client";

import { useState } from "react";
import {
  EVENT_KIND_LABEL,
  eventSummary,
  formatEventTime,
  type EventLogEntry,
} from "../../lib/eventLog";

export default function EventLogPanel({ entries }: { entries: EventLogEntry[] }) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <div className={`event-log-panel${open ? " event-log-panel--open" : ""}`}>
      <button
        type="button"
        className="event-log-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="event-log-toggle-label">이벤트 로그</span>
        <span className="event-log-count">{entries.length}</span>
        <span className="event-log-chevron" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <ul className="event-log-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`event-log-item event-log-item--${entry.kind}`}
            >
              <span className="event-log-time">{formatEventTime(entry.at)}</span>
              <span className={`event-log-kind event-log-kind--${entry.kind}`}>
                {EVENT_KIND_LABEL[entry.kind]}
              </span>
              <span className="event-log-text">{eventSummary(entry)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
