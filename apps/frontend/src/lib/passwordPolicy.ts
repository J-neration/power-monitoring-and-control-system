export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty",
  "qwerty12",
  "qwerty123",
  "qwertyui",
  "abc12345",
  "abcd1234",
  "admin123",
  "admin1234",
  "letmein1",
  "welcome1",
  "welcome12",
  "test1234",
  "testtest",
  "11111111",
  "00000000",
  "aaaaaaaa",
  "asdfasdf",
  "1q2w3e4r",
  "zaq12wsx",
  "q1w2e3r4",
  "pass1234",
  "adminadmin",
  "changeme",
  "changeme1",
  "default1",
  "pmcs1234",
  "pqms1234",
]);

export type PasswordValidation =
  | { ok: true }
  | { ok: false; message: string };

export const validatePassword = (
  plain: string,
  opts?: { username?: string },
): PasswordValidation => {
  if (typeof plain !== "string" || plain.length === 0) {
    return { ok: false, message: "비밀번호를 입력해주세요." };
  }
  if (plain.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`,
    };
  }
  if (plain.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      message: `비밀번호는 ${PASSWORD_MAX_LENGTH}자 이하여야 합니다.`,
    };
  }
  if (/\s/.test(plain)) {
    return { ok: false, message: "비밀번호에 공백을 넣을 수 없습니다." };
  }

  const lower = plain.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    return {
      ok: false,
      message: "너무 흔한 비밀번호입니다. 다른 비밀번호를 사용해 주세요.",
    };
  }

  const username = opts?.username?.trim().toLowerCase();
  if (username && lower === username) {
    return {
      ok: false,
      message: "아이디와 동일한 비밀번호는 사용할 수 없습니다.",
    };
  }

  return { ok: true };
};
