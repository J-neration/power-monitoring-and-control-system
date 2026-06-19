"use client";

import { useState } from "react";
import Image from "next/image";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? "로그인에 실패했습니다.");
        return;
      }

      window.location.href = "/";
      return;
    } catch {
      setError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-page-grid" aria-hidden />
      <div className="login-page-scanline" aria-hidden />

      <div className="login-card">
        <div className="login-status-strip" aria-hidden>
          <span className="login-status-dot login-status-dot--live" />
          <span>SYSTEM ONLINE</span>
          <span className="login-status-sep">|</span>
          <span>PMCS v0.1</span>
        </div>

        <div className="login-logo">
          <Image
            src="/logo.png"
            alt="PrimeSolution"
            width={48}
            height={22}
            priority
          />
          <span className="login-logo-text">PRIMESOLUTION</span>
        </div>

        <p className="login-system-badge">전력 모니터링 관제센터</p>

        <h1 className="login-title">운영자 로그인</h1>
        <p className="login-subtitle">
          Power Monitoring and Control System
        </p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label className="login-label" htmlFor="username">
              아이디
            </label>
            <input
              id="username"
              className="login-input"
              type="text"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="password">
              비밀번호
            </label>
            <input
              id="password"
              className="login-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button
            type="submit"
            className={`login-btn${loading ? " loading" : ""}`}
            disabled={loading}
          >
            {loading ? <span className="login-spinner" /> : "관제 시스템 접속"}
          </button>
        </form>

        <p className="login-footer">
          PrimeSolution &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
