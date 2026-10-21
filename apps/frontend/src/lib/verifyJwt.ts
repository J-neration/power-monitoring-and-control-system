/**
 * HS256 JWT 의 서명·만료를 확인한다. middleware(Edge 런타임)에서 쓰므로 Web Crypto 만 사용한다.
 * 백엔드 @fastify/jwt 의 기본 서명(HS256 + exp)과 맞춘다.
 */
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const base64UrlToBytes = (value: string): Uint8Array => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

const decodeJson = (segment: string): Record<string, unknown> =>
  JSON.parse(textDecoder.decode(base64UrlToBytes(segment)));

export async function verifyHs256Jwt(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [header, payload, signature] = parts;

  try {
    if (decodeJson(header).alg !== "HS256") return false;

    const key = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureValid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      textEncoder.encode(`${header}.${payload}`),
    );
    if (!signatureValid) return false;

    const claims = decodeJson(payload);
    if (typeof claims.exp === "number" && claims.exp <= nowSec) return false;
    if (typeof claims.nbf === "number" && claims.nbf > nowSec) return false;
    return true;
  } catch {
    return false;
  }
}
