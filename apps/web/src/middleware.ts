import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  ADMIN_MIDDLEWARE_MATCHER,
  buildAdminMisconfiguredResponse,
  buildUnauthorizedAdminResponse,
  isAuthorizedAdminRequest,
} from "./lib/admin/auth";
import { loadAdminAuthEnv } from "./lib/admin/env";

export function middleware(request: NextRequest): NextResponse {
  try {
    const credentials = loadAdminAuthEnv(process.env);
    const authorization = request.headers.get("authorization");

    if (!isAuthorizedAdminRequest(authorization, credentials)) {
      return buildUnauthorizedAdminResponse();
    }

    return NextResponse.next();
  } catch (error) {
    return buildAdminMisconfiguredResponse(error);
  }
}

export const config = {
  matcher: ADMIN_MIDDLEWARE_MATCHER,
};
