import { Container } from "@cloudflare/containers";

import { parseFinalizeInput } from "./api";
import { createMosaicGeneratorDispatchState } from "./mosaic-generator-state";
import { loadFinalizeRuntimeEnv } from "./runtime-env";

export type MosaicGeneratorDispatchResponse = {
  readonly accepted: boolean;
  readonly state: "completed" | "running";
  readonly unitId: string;
};

export class MosaicGeneratorContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";

  private readonly dispatchState = createMosaicGeneratorDispatchState();

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok");
    }

    if (request.method === "POST" && url.pathname === "/dispatch") {
      const input = parseFinalizeInput(await request.json());
      return Response.json(await this.handleDispatch(input.unitId));
    }

    return new Response("Not Found", { status: 404 });
  }

  private async handleDispatch(
    unitId: string,
  ): Promise<MosaicGeneratorDispatchResponse> {
    const decision = this.dispatchState.begin();
    if (!decision.accepted) {
      return {
        accepted: false,
        state: decision.state,
        unitId,
      };
    }

    getContainerRuntime(this).waitUntil(this.runFinalize(unitId));
    return {
      accepted: true,
      state: decision.state,
      unitId,
    };
  }

  private async runFinalize(unitId: string): Promise<void> {
    try {
      await this.startAndWaitForPorts({
        startOptions: {
          envVars: loadFinalizeRuntimeEnv(process.env),
        },
      });

      const response = await this.containerFetch("http://container/dispatch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ unitId }),
      });

      if (!response.ok) {
        throw new Error(`Generator runtime returned ${response.status}.`);
      }

      const payload = (await response.json()) as {
        readonly status?: "finalized" | "ignored_finalized" | "ignored_pending";
      };

      if (payload.status === "ignored_pending") {
        this.dispatchState.reset();
        return;
      }

      this.dispatchState.complete();
    } catch (error) {
      this.dispatchState.reset();
      console.error("Mosaic finalize run failed", error);
    }
  }
}

function getContainerRuntime(container: MosaicGeneratorContainer): {
  waitUntil(promise: Promise<unknown>): void;
} {
  return (
    container as unknown as {
      ctx: {
        waitUntil(promise: Promise<unknown>): void;
      };
    }
  ).ctx;
}
