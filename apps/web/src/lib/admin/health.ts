import { DISPATCH_SECRET_HEADER } from "../finalize/dispatch";

import { loadAdminRelayEnv } from "./env";

export type AdminHealthStatus = {
  readonly httpStatus: number | null;
  readonly status: "misconfigured" | "ok" | "unauthorized" | "unreachable";
};

export type AdminHealthSummary = {
  readonly dispatchAuthorization: AdminHealthStatus;
  readonly generatorReadiness: AdminHealthStatus;
};

export async function getAdminHealth(): Promise<AdminHealthSummary> {
  try {
    const relay = loadAdminRelayEnv(process.env);

    const [generatorReadiness, dispatchAuthorization] = await Promise.all([
      fetchGeneratorReadiness(relay.generatorBaseUrl),
      fetchDispatchAuthorization(relay.generatorBaseUrl, relay.sharedSecret),
    ]);

    return {
      dispatchAuthorization,
      generatorReadiness,
    };
  } catch {
    return {
      dispatchAuthorization: {
        httpStatus: null,
        status: "misconfigured",
      },
      generatorReadiness: {
        httpStatus: null,
        status: "misconfigured",
      },
    };
  }
}

async function fetchGeneratorReadiness(
  generatorBaseUrl: string,
): Promise<AdminHealthStatus> {
  try {
    const response = await fetch(
      new Request(new URL("/health", `${generatorBaseUrl}/`).toString(), {
        method: "GET",
      }),
    );

    return {
      httpStatus: response.status,
      status: response.ok ? "ok" : "unreachable",
    };
  } catch {
    return {
      httpStatus: null,
      status: "unreachable",
    };
  }
}

async function fetchDispatchAuthorization(
  generatorBaseUrl: string,
  sharedSecret: string,
): Promise<AdminHealthStatus> {
  try {
    const response = await fetch(
      new Request(
        new URL("/dispatch-auth-probe", `${generatorBaseUrl}/`).toString(),
        {
          method: "GET",
          headers: {
            [DISPATCH_SECRET_HEADER]: sharedSecret,
          },
        },
      ),
    );

    return {
      httpStatus: response.status,
      status: mapDispatchStatus(response.status),
    };
  } catch {
    return {
      httpStatus: null,
      status: "unreachable",
    };
  }
}

function mapDispatchStatus(httpStatus: number): AdminHealthStatus["status"] {
  if (httpStatus === 200) {
    return "ok";
  }
  if (httpStatus === 401) {
    return "unauthorized";
  }
  return "unreachable";
}
