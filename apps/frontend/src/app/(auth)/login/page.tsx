"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);

    // TODO: 실제 인증 API 연동
    router.push("/");
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <Image src="/logo.png" alt="PrimeSolution" width={48} height={22} priority />
          <span className="login-logo-text">PRIMESOLUTION</span>
        </div>

        <h1 className="login-title">로그인</h1>
        <p className="login-subtitle">PMCS 전력 모니터링 시스템</p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label className="login-label" htmlFor="email">이메일</label>
            <input
              id="email"
              className="login-input"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="password">비밀번호</label>
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
            {loading ? (
              <span className="login-spinner" />
            ) : (
              "로그인"
            )}
          </button>
        </form>

        <p className="login-footer">
          PrimeSolution &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
