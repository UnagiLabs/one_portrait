import { describe, expect, it } from "vitest";

import { createMosaicGeneratorDispatchState } from "./mosaic-generator-state";

describe("createMosaicGeneratorDispatchState", () => {
  it("accepts the first dispatch and rejects a concurrent duplicate", () => {
    const state = createMosaicGeneratorDispatchState();

    expect(state.begin()).toEqual({
      accepted: true,
      state: "running",
    });
    expect(state.begin()).toEqual({
      accepted: false,
      state: "running",
    });
  });

  it("marks the unit as completed after the first run", () => {
    const state = createMosaicGeneratorDispatchState();

    state.begin();
    state.complete();

    expect(state.begin()).toEqual({
      accepted: false,
      state: "completed",
    });
  });

  it("can be reset for a future retry path", () => {
    const state = createMosaicGeneratorDispatchState();

    state.begin();
    state.complete();
    state.reset();

    expect(state.begin()).toEqual({
      accepted: true,
      state: "running",
    });
  });
});
