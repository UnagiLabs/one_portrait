export type MosaicGeneratorDispatchDecision =
  | {
      readonly accepted: false;
      readonly state: "completed" | "running";
    }
  | {
      readonly accepted: true;
      readonly state: "running";
    };

export function createMosaicGeneratorDispatchState() {
  let state: "completed" | "idle" | "running" = "idle";

  return {
    begin(): MosaicGeneratorDispatchDecision {
      if (state === "running") {
        return { accepted: false, state: "running" };
      }

      if (state === "completed") {
        return { accepted: false, state: "completed" };
      }

      state = "running";
      return { accepted: true, state: "running" };
    },
    complete(): void {
      state = "completed";
    },
    reset(): void {
      state = "idle";
    },
  };
}
