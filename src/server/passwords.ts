/**
 * Password hashing (scrypt, Node built-in) and secure token generation.
 * scrypt params follow OWASP guidance (N=2^15, r=8, p=1).
 */

import {
  createHash,
  randomBytes,
  scrypt as _scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltHex, keyHex] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const key = await scrypt(
      password.normalize("NFKC"),
      Buffer.from(saltHex, "hex"),
      keyHex.length / 2,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 }
    );
    return timingSafeEqual(key, Buffer.from(keyHex, "hex"));
  } catch {
    return false;
  }
}

export const generateToken = (bytes = 32) =>
  randomBytes(bytes).toString("base64url");

export const sha256 = (v: string) =>
  createHash("sha256").update(v).digest("hex");

export function passwordProblems(pw: string): string[] {
  const problems: string[] = [];
  if (pw.length < 8) problems.push("at least 8 characters");
  if (!/[a-zA-Z]/.test(pw)) problems.push("a letter");
  if (!/[0-9]/.test(pw)) problems.push("a number");
  return problems;
}
