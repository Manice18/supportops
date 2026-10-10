import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SignJWT, jwtVerify } from "jose";
import { userRoleSchema, type UserRole } from "@supportops/shared";
import "@fastify/cookie";

export const SESSION_COOKIE = "supportops_session";
export const CSRF_COOKIE = "supportops_csrf";
export const TOKEN_ISSUER = "supportops-demo";
export const TOKEN_USE = "supportops_access";

const SESSION_TTL_SECONDS = 12 * 60 * 60;
const revokedSessionIds = new Set<string>();

export type VerifiedSession = {
  sub: string;
  role: UserRole;
  sid: string;
  csrf: string;
  exp: number;
  accessToken: string;
};

function cookieOptions(httpOnly: boolean) {
  return {
    path: "/",
    httpOnly,
    sameSite: "lax" as const,
    secure: false,
    maxAge: SESSION_TTL_SECONDS,
  };
}

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function issueSession(
  reply: FastifyReply,
  secret: string,
  user: { id: string; role: UserRole },
): Promise<{ accessToken: string; claims: { sub: string; role: UserRole; iss: string; exp: number } }> {
  const csrf = randomBytes(32).toString("base64url");
  const sid = randomBytes(16).toString("base64url");
  const accessToken = await new SignJWT({
    role: user.role,
    sid,
    csrf,
    tokenUse: TOKEN_USE,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(TOKEN_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey(secret));

  const verified = await readToken(accessToken, secret);
  if (!verified) {
    throw new Error("Issued access token could not be verified.");
  }

  reply.setCookie(SESSION_COOKIE, Buffer.from(accessToken, "utf8").toString("base64url"), {
    ...cookieOptions(true),
    signed: true,
  });
  reply.setCookie(CSRF_COOKIE, csrf, cookieOptions(false));
  return {
    accessToken,
    claims: {
      sub: verified.sub,
      role: verified.role,
      iss: TOKEN_ISSUER,
      exp: verified.exp,
    },
  };
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  reply.clearCookie(CSRF_COOKIE, { path: "/" });
}

export function revokeSession(request: FastifyRequest): void {
  if (request.session) revokedSessionIds.add(request.session.sid);
}

export async function readSession(request: FastifyRequest, secret: string): Promise<VerifiedSession | null> {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  let accessToken: string;
  try {
    accessToken = Buffer.from(unsigned.value, "base64url").toString("utf8");
  } catch {
    return null;
  }
  return readToken(accessToken, secret);
}

async function readToken(accessToken: string, secret: string): Promise<VerifiedSession | null> {
  try {
    const { payload } = await jwtVerify(accessToken, secretKey(secret), {
      issuer: TOKEN_ISSUER,
      algorithms: ["HS256"],
    });
    const role = userRoleSchema.safeParse(payload.role);
    if (
      typeof payload.sub !== "string" ||
      !role.success ||
      typeof payload.sid !== "string" ||
      typeof payload.csrf !== "string" ||
      payload.tokenUse !== TOKEN_USE ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (revokedSessionIds.has(payload.sid)) return null;
    return {
      sub: payload.sub,
      role: role.data,
      sid: payload.sid,
      csrf: payload.csrf,
      exp: payload.exp,
      accessToken,
    };
  } catch {
    return null;
  }
}

export function csrfMatches(request: FastifyRequest, csrf: string): boolean {
  const header = request.headers["x-csrf-token"];
  if (typeof header !== "string") return false;
  const left = Buffer.from(csrf);
  const right = Buffer.from(header);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
