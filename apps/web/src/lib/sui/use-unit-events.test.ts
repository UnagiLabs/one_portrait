// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { subscribeMock } = vi.hoisted(() => ({ subscribeMock: vi.fn() }));

vi.mock("./events", () => ({
  subscribeToUnitEvents: subscribeMock,
}));

import type { SubscribeToUnitEventsArgs } from "./events";
import { useUnitEvents } from "./use-unit-events";

afterEach(() => {
  subscribeMock.mockReset();
});

describe("useUnitEvents", () => {
  it("subscribes on mount with packageId / unitId / handlers and unsubscribes on unmount", () => {
    const unsubscribe = vi.fn();
    subscribeMock.mockReturnValue(unsubscribe);

    const onSubmitted = vi.fn();
    const onFilled = vi.fn();
    const onMosaicReady = vi.fn();

    const { unmount } = renderHook(() =>
      useUnitEvents({
        packageId: "0xpkg",
        unitId: "0xunit-1",
        onSubmitted,
        onFilled,
        onMosaicReady,
      }),
    );

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    const args = subscribeMock.mock.calls[0]?.[0] as SubscribeToUnitEventsArgs;
    expect(args.packageId).toBe("0xpkg");
    expect(args.unitId).toBe("0xunit-1");
    expect(typeof args.handlers.onSubmitted).toBe("function");
    expect(typeof args.handlers.onFilled).toBe("function");
    expect(typeof args.handlers.onMosaicReady).toBe("function");

    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe when packageId or unitId is missing", () => {
    const { unmount } = renderHook(() =>
      useUnitEvents({
        packageId: "",
        unitId: "0xunit-1",
      }),
    );

    expect(subscribeMock).not.toHaveBeenCalled();
    unmount();
  });
});
