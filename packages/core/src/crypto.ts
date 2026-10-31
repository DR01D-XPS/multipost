import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE_NAME = "multipost_session";

type SessionPayload = {
  sub: string;
  exp: number;
};

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptJson(value: unknown, secret: string): string {
  const iv = randomBytes(12);
  const key = deriveKey(secret);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [base64UrlEncode(iv), base64UrlEncode(authTag), base64UrlEncode(encrypted)].join(".");
}

export function decryptJson<T>(value: string, secret: string): T {
  const [ivPart, authTagPart, cipherPart] = value.split(".");
  if (!ivPart || !authTagPart || !cipherPart) {
    throw new Error("Invalid encrypted payload format");
  }

  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), base64UrlDecode(ivPart));
  decipher.setAuthTag(base64UrlDecode(authTagPart));
  const decrypted = Buffer.concat([decipher.update(base64UrlDecode(cipherPart)), decipher.final()]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}

function sign(value: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(value).digest());
}

export function createSessionToken(username: string, secret: string, ttlHours = 24): string {
  const payload: SessionPayload = {
    sub: username,
    exp: Date.now() + ttlHours * 60 * 60 * 1000
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string | undefined, secret: string): SessionPayload | null {
  if (!token) {
    return null;
  }

  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expectedSignature = sign(payloadPart, secret);
  if (signaturePart.length !== expectedSignature.length) {
    return null;
  }

  const matches = timingSafeEqual(Buffer.from(signaturePart), Buffer.from(expectedSignature));
  if (!matches) {
    return null;
  }

  const payload = JSON.parse(base64UrlDecode(payloadPart).toString("utf8")) as SessionPayload;
  if (payload.exp < Date.now()) {
    return null;
  }

  return payload;
}

function equalsConstantTime(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function matchesAdminCredentials(
  username: string,
  password: string,
  expectedUsername: string,
  expectedPassword: string
): boolean {
  return equalsConstantTime(username, expectedUsername) && equalsConstantTime(password, expectedPassword);
}
