import testnetDeploymentManifest from "../../../../../ops/deployments/testnet.json";
import { DISPATCH_SECRET_HEADER } from "../finalize/dispatch";
import {
  type GeneratorRuntimeCloudflareEnv,
  resolveCloudflareGeneratorRuntime,
  resolveGeneratorRuntime,
} from "../generator-runtime";

export type AdminHealthStatus = {
  readonly adminCapId?: string;
  readonly httpStatus: number | null;
  readonly network?: string;
  readonly packageId?: string;
  readonly status: "misconfigured" | "ok" | "unauthorized" | "unreachable";
};

export type AdminHealthSummary = {
  readonly currentUrl: string | null;
  readonly dispatchAuthorization: AdminHealthStatus;
  readonly expectedDeployment: {
    readonly network: string;
    readonly packageId: string;
  };
  readonly generatorReadiness: AdminHealthStatus;
  readonly resolutionStatus: "misconfigured" | "ok";
  readonly source:
    | "fallback"
    | "legacy_env"
    | "none"
    | "override"
    | "runtime_state"
    | "worker_kv";
};

type GetAdminHealthDeps = {
  readonly env?: GeneratorRuntimeCloudflareEnv;
};

const expectedDeployment = {
  network: testnetDeploymentManifest.network,
  packageId: testnetDeploymentManifest.packageId,
} as const;

export async function getAdminHealth(
  deps: GetAdminHealthDeps = {},
): Promise<AdminHealthSummary> {
  const env = deps.env ?? process.env;
  const runtime =
    deps.env === undefined
      ? resolveGeneratorRuntime({ env: process.env })
      : await resolveCloudflareGeneratorRuntime({ env });
  if (runtime.status !== "ok") {
    return {
      currentUrl: null,
      dispatchAuthorization: {
        httpStatus: null,
        status: "misconfigured",
      },
      expectedDeployment,
      generatorReadiness: {
        httpStatus: null,
        status: "misconfigured",
      },
      resolutionStatus: "misconfigured",
      source: "none",
    };
  }

  const sharedSecret = normalizeSharedSecret(
    typeof env.OP_FINALIZE_DISPATCH_SECRET === "string"
      ? env.OP_FINALIZE_DISPATCH_SECRET
      : undefined,
  );
  const [generatorReadiness, dispatchAuthorization] = await Promise.all([
    fetchGeneratorReadiness(runtime.url),
    sharedSecret === null
      ? Promise.resolve({
          httpStatus: null,
          status: "misconfigured",
        } satisfies AdminHealthStatus)
      : fetchDispatchAuthorization(runtime.url, sharedSecret),
  ]);
  const deploymentMatches =
    generatorReadiness.status === "ok" &&
    generatorReadiness.packageId === expectedDeployment.packageId;
  const effectiveGeneratorReadiness =
    generatorReadiness.status === "ok" && !deploymentMatches
      ? ({
          ...generatorReadiness,
          status: "misconfigured",
        } satisfies AdminHealthStatus)
      : generatorReadiness;

  return {
    currentUrl: runtime.url,
    dispatchAuthorization,
    expectedDeployment,
    generatorReadiness: effectiveGeneratorReadiness,
    resolutionStatus:
      effectiveGeneratorReadiness.status === "ok" ? "ok" : "misconfigured",
    source: runtime.source,
  };
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

    const payload = await readGeneratorHealthPayload(response);

    return {
      adminCapId: payload?.adminCapId,
      httpStatus: response.status,
      network: payload?.network,
      packageId: payload?.packageId,
      status: response.ok ? "ok" : "unreachable",
    };
  } catch {
    return {
      httpStatus: null,
      status: "unreachable",
    };
  }
}

async function readGeneratorHealthPayload(response: Response): Promise<{
  readonly adminCapId?: string;
  readonly network?: string;
  readonly packageId?: string;
} | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    return {
      adminCapId: readString(payload, "adminCapId"),
      network: readString(payload, "network"),
      packageId: readString(payload, "packageId"),
    };
  } catch {
    return null;
  }
}

function readString(source: object, key: string): string | undefined {
  const value = (source as Record<string, unknown>)[key];
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : undefined;
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

function normalizeSharedSecret(value: string | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}
