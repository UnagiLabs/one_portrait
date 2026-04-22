import { NextResponse } from "next/server";

import type { AdminAuthEnv } from "./env";

export const ADMIN_MIDDLEWARE_MATCHER = ["/admin/:path*", "/api/admin/:path*"];
export const ADMIN_BASIC_AUTH_CHALLENGE =
  'Basic realm="ONE Portrait Admin", charset="UTF-8"';

export function isAuthorizedAdminRequest(
  authorization: string | null,
  credentials: AdminAuthEnv,
): boolean {
  if (!authorization?.startsWith("Basic ")) {
    return false;
  }

  const encoded = authorization.slice("Basic ".length).trim();
  if (encoded.length === 0) {
    return false;
  }

  let decoded = "";
  try {
    decoded = decodeBase64(encoded);
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) {
    return false;
  }

  return (
    decoded.slice(0, separatorIndex) === credentials.username &&
    decoded.slice(separatorIndex + 1) === credentials.password
  );
}

export function buildUnauthorizedAdminResponse(): NextResponse {
  return new NextResponse("Unauthorized", {
    headers: {
      "www-authenticate": ADMIN_BASIC_AUTH_CHALLENGE,
    },
    status: 401,
  });
}

export function buildAdminMisconfiguredResponse(error: unknown): NextResponse {
  console.error("Admin auth is not configured", error);

  return NextResponse.json(
    {
      code: "admin_unavailable",
      message: "Admin auth is not configured.",
    },
    { status: 503 },
  );
}

function decodeBase64(value: string): string {
  if (typeof atob === "function") {
    return atob(value);
  }

  return Buffer.from(value, "base64").toString("utf-8");
}
