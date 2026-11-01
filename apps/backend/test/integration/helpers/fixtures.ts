import bcrypt from "bcryptjs";
import { prisma } from "../../../src/lib/prisma.js";
import type { JwtPayload } from "../../../src/modules/auth/auth.types.js";
import type { TestApp } from "./app.js";

/** 비밀번호 정책을 통과하는 테스트용 비밀번호. */
export const PASSWORD = "Regression#2026";

type Role = "ADMIN" | "CLIENT" | "SITE";

export const createUser = async (opts: {
  username: string;
  role: Role;
  password?: string;
  clientKey?: string;
  siteId?: string;
  isActive?: boolean;
}) =>
  prisma.user.create({
    data: {
      username: opts.username,
      // 운영은 cost 12 — 검증 로직은 cost 와 무관하므로 테스트 속도를 위해 낮춘다.
      passwordHash: await bcrypt.hash(opts.password ?? PASSWORD, 4),
      role: opts.role,
      clientKey: opts.clientKey ?? null,
      siteId: opts.siteId ?? null,
      isActive: opts.isActive ?? true,
    },
  });

/** 로그인 API 가 발급하는 것과 같은 payload 로 토큰을 만든다. */
export const tokenFor = (
  app: TestApp,
  user: { id: string; username: string; role: Role; clientKey?: string | null; siteId?: string | null },
) => {
  const payload: JwtPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    ...(user.clientKey ? { clientKey: user.clientKey } : {}),
    ...(user.siteId ? { siteId: user.siteId } : {}),
  };
  return app.jwt.sign(payload, { expiresIn: "8h" });
};

export const createSite = (opts: { id: string; client: string; name?: string; region?: string }) =>
  prisma.site.create({
    data: {
      id: opts.id,
      name: opts.name ?? `현장 ${opts.id}`,
      client: opts.client,
      region: opts.region ?? "서울",
      address: "서울시 테스트구 회귀로 1",
    },
  });

/** 관리자 화면에서 설치지점을 만들 때처럼 빈 Device 행도 함께 만든다. */
export const createInstallation = async (opts: {
  id: string;
  siteId: string;
  label?: string;
  iccid?: string;
}) => {
  const installation = await prisma.installation.create({
    data: { id: opts.id, siteId: opts.siteId, label: opts.label ?? opts.id, iccid: opts.iccid ?? null },
  });
  await prisma.device.create({ data: { installationId: opts.id, lastIp: "unknown", lastSeenAt: null } });
  return installation;
};

export const IDS = {
  lotteSite: "lotte-regression",
  gsSite: "gs-regression",
  lotteInst: "TEST-LOTTE-01",
  gsInst: "TEST-GS-01",
  lotteIccid: "89820000000000000017",
  gsIccid: "89820000000000000025",
} as const;

/**
 * 권한 경계를 확인할 수 있는 최소 구성.
 *   - 롯데 현장 1곳 + 설치지점(ICCID 등록) / GS 현장 1곳 + 설치지점
 *   - ADMIN, 롯데 CLIENT, GS 현장 SITE 계정과 각 토큰
 */
export const seedWorld = async (app: TestApp) => {
  await createSite({ id: IDS.lotteSite, client: "lotte", name: "롯데 회귀 현장" });
  await createSite({ id: IDS.gsSite, client: "gs", name: "GS 회귀 현장" });
  await createInstallation({ id: IDS.lotteInst, siteId: IDS.lotteSite, label: "변전실", iccid: IDS.lotteIccid });
  await createInstallation({ id: IDS.gsInst, siteId: IDS.gsSite, label: "전기실", iccid: IDS.gsIccid });

  const admin = await createUser({ username: "admin-reg", role: "ADMIN" });
  const client = await createUser({ username: "lotte-reg", role: "CLIENT", clientKey: "lotte" });
  const site = await createUser({ username: "gs-site-reg", role: "SITE", siteId: IDS.gsSite });

  return {
    users: { admin, client, site },
    tokens: {
      admin: tokenFor(app, admin),
      client: tokenFor(app, client),
      site: tokenFor(app, site),
    },
  };
};

/** HMI 텔레메트리 한 건 — 실제 펌웨어가 보내는 형태(숫자 문자열 섞임)를 흉내 낸다. */
export const telemetryPayload = (overrides: Record<string, unknown> = {}) => ({
  iccid: IDS.lotteIccid,
  model: "psvg",
  numOfMods: 3,
  moduleStatus: [2, 2, 0],
  vL1: "221.5",
  vL2: 220.1,
  vL3: 219.8,
  gridCurrentL1: 81.2,
  loadCurrentL1: 120.4,
  tpf1: -13.7,
  tpf2: -93.2,
  uncompP: 7.3,
  totalCapacity: 150,
  operatingCapacity: 100,
  areaTemp: [31.5, 32],
  moduleTemp: [40, 41, 39],
  csq: "21",
  rsrp: -84,
  ...overrides,
});
