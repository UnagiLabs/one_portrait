import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { middleware } from "./middleware";

const AUTH_USER = "demo-admin";
const AUTH_PASS = "demo-pass";

describe("middleware", () => {
  afterEach(() => {
    delete process.env.OP_ADMIN_BASIC_AUTH_PASSWORD;
    delete process.env.OP_ADMIN_BASIC_AUTH_USERNAME;
  });

  it("returns 503 when admin auth is not configured", () => {
    const response = middleware(new NextRequest("http://localhost/admin"));

    expect(response.status).toBe(503);
  });

  it("returns 401 for /admin without credentials", () => {
    configureAdminAuth();

    const response = middleware(new NextRequest("http://localhost/admin"));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
  });

  it("allows /admin with valid credentials", () => {
    configureAdminAuth();

    const response = middleware(
      new NextRequest("http://localhost/admin", {
        headers: {
          authorization: basicAuthHeader(AUTH_USER, AUTH_PASS),
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("www-authenticate")).toBeNull();
  });

  it("allows nested admin api routes with valid credentials", () => {
    configureAdminAuth();

    const response = middleware(
      new NextRequest("http://localhost/api/admin/status", {
        headers: {
          authorization: basicAuthHeader(AUTH_USER, AUTH_PASS),
        },
      }),
    );

    expect(response.status).toBe(200);
  });
});

function configureAdminAuth(): void {
  process.env.OP_ADMIN_BASIC_AUTH_PASSWORD = AUTH_PASS;
  process.env.OP_ADMIN_BASIC_AUTH_USERNAME = AUTH_USER;
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
