import bcrypt from "bcryptjs";
import { PrismaClient } from "../../../prisma/generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import type { JwtPayload, UserContext } from "./auth.types.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/* ─── 비밀번호 유틸 ─────────────────────────────── */
export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) =>
  bcrypt.compare(plain, hash);

/* ─── 로그인 ─────────────────────────────────────── */
export const login = async (username: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { username } });

  // 사용자 미존재 / 비활성화 / 비밀번호 불일치 모두 동일 메시지 (정보 노출 방지)
  const INVALID_MSG = "아이디 또는 비밀번호가 올바르지 않습니다.";

  if (!user || !user.isActive) throw new Error(INVALID_MSG);

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new Error(INVALID_MSG);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const payload: JwtPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    ...(user.clientKey ? { clientKey: user.clientKey } : {}),
    ...(user.siteId ? { siteId: user.siteId } : {}),
  };

  const safeUser = {
    id: user.id,
    username: user.username,
    role: user.role,
    clientKey: user.clientKey,
    siteId: user.siteId,
  };

  return { payload, user: safeUser };
};

/* ─── JWT payload → UserContext 변환 ─────────────── */
export const toUserContext = (payload: JwtPayload): UserContext => {
  if (payload.role === "ADMIN") {
    return { role: "ADMIN", userId: payload.sub, username: payload.username };
  }
  if (payload.role === "CLIENT") {
    if (!payload.clientKey)
      throw new Error("CLIENT 토큰에 clientKey가 없습니다.");
    return {
      role: "CLIENT",
      userId: payload.sub,
      username: payload.username,
      clientKey: payload.clientKey,
    };
  }
  // SITE
  if (!payload.siteId) throw new Error("SITE 토큰에 siteId가 없습니다.");
  return {
    role: "SITE",
    userId: payload.sub,
    username: payload.username,
    siteId: payload.siteId,
  };
};

/* ─── 계정 관리 (ADMIN 전용) ─────────────────────── */
export const userManagementService = {
  list: () =>
    prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        clientKey: true,
        siteId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),

  create: async (data: {
    username: string;
    role: "ADMIN" | "CLIENT" | "SITE";
    clientKey?: string;
    siteId?: string;
    initialPassword?: string;
  }) => {
    const passwordHash = await hashPassword(data.initialPassword ?? "abc123");
    return prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        role: data.role,
        clientKey: data.clientKey ?? null,
        siteId: data.siteId ?? null,
      },
      select: {
        id: true,
        username: true,
        role: true,
        clientKey: true,
        siteId: true,
        isActive: true,
        createdAt: true,
      },
    });
  },

  update: async (
    id: string,
    data: {
      isActive?: boolean;
      newPassword?: string;
      clientKey?: string | null;
      siteId?: string | null;
    }
  ) => {
    return prisma.user.update({
      where: { id },
      data: {
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.newPassword
          ? { passwordHash: await hashPassword(data.newPassword) }
          : {}),
        ...(data.clientKey !== undefined ? { clientKey: data.clientKey } : {}),
        ...(data.siteId !== undefined ? { siteId: data.siteId } : {}),
      },
      select: {
        id: true,
        username: true,
        role: true,
        clientKey: true,
        siteId: true,
        isActive: true,
        updatedAt: true,
      },
    });
  },

  delete: (id: string) => prisma.user.delete({ where: { id } }),
};
