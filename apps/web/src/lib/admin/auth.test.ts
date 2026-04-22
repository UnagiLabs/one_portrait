import { describe, expect, it } from "vitest";

import {
  ADMIN_BASIC_AUTH_CHALLENGE,
  ADMIN_MIDDLEWARE_MATCHER,
  buildUnauthorizedAdminResponse,
  isAuthorizedAdminRequest,
} from "./auth";

describe("ADMIN_MIDDLEWARE_MATCHER", () => {
  it("protects only admin pages and admin api routes", () => {
    expect(ADMIN_MIDDLEWARE_MATCHER).toEqual(["/admin/:path*", "/api/admin/:path*"]);
  });
});

describe("isAuthorizedAdminRequest", () => {
  const credentials = {
    password: "demo-pass",
    username: "demo-admin",
  } as const;

  it("accepts a valid basic auth header", () => {
    const authorization = `Basic ${Buffer.from("demo-admin:demo-pass").toString("base64")}`;

    expect(isAuthorizedAdminRequest(authorization, credentials)).toBe(true);
  });

  it("rejects a missing header", () => {
    expect(isAuthorizedAdminRequest(null, credentials)).toBe(false);
  });

  it("rejects malformed base64 payloads", () => {
    expect(isAuthorizedAdminRequest("Basic ###", credentials)).toBe(false);
  });

  it("rejects wrong credentials", () => {
    const authorization = `Basic ${Buffer.from("demo-admin:nope").toString("base64")}`;

    expect(isAuthorizedAdminRequest(authorization, credentials)).toBe(false);
  });
});

describe("buildUnauthorizedAdminResponse", () => {
  it("returns a 401 with a basic auth challenge header", () => {
    const response = buildUnauthorizedAdminResponse();

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      ADMIN_BASIC_AUTH_CHALLENGE,
    );
  });
});
