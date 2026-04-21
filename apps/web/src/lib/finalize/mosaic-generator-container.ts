import { Container } from "@cloudflare/containers";

import { parseFinalizeInput } from "./api";
import { createMosaicGeneratorDispatchState } from "./mosaic-generator-state";

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

    this.dispatchState.complete();
    return {
      accepted: true,
      state: decision.state,
      unitId,
    };
  }
}
