// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  MosaicReadyEvent,
  SubmittedEvent,
  UnitFilledEvent,
} from "../../../lib/sui";
import type { UseUnitEventsArgs } from "../../../lib/sui/react";

const { useUnitEventsMock } = vi.hoisted(() => ({
  useUnitEventsMock: vi.fn(),
}));

vi.mock("../../../lib/sui/react", () => ({
  useUnitEvents: useUnitEventsMock,
}));

import { LiveProgress } from "./live-progress";

afterEach(() => {
  useUnitEventsMock.mockReset();
});

describe("LiveProgress", () => {
  it("renders the initial server-provided count", () => {
    useUnitEventsMock.mockImplementation(() => undefined);

    render(
      <LiveProgress
        packageId="0xpkg"
        unitId="0xunit-1"
        initialSubmittedCount={42}
        maxSlots={unitTileCount}
      />,
    );

    expect(
      screen.getByText(new RegExp(`42\\s*/\\s*${unitTileCount}`)),
    ).toBeTruthy();
  });

  it("updates the count when a SubmittedEvent arrives", () => {
    let capturedOnSubmitted: ((event: SubmittedEvent) => void) | undefined;
    useUnitEventsMock.mockImplementation((args: UseUnitEventsArgs) => {
      capturedOnSubmitted = args.onSubmitted;
    });

    render(
      <LiveProgress
        packageId="0xpkg"
        unitId="0xunit-1"
        initialSubmittedCount={10}
        maxSlots={unitTileCount}
      />,
    );

    expect(
      screen.getByText(new RegExp(`10\\s*/\\s*${unitTileCount}`)),
    ).toBeTruthy();

    act(() => {
      capturedOnSubmitted?.({
        kind: "submitted",
        unitId: "0xunit-1",
        athletePublicId: "1",
        submitter: "0xabc",
        walrusBlobId: [],
        submissionNo: 11,
        submittedCount: 11,
        maxSlots: unitTileCount,
      });
    });

    expect(
      screen.getByText(new RegExp(`11\\s*/\\s*${unitTileCount}`)),
    ).toBeTruthy();
  });

  it("ignores older SubmittedEvent deliveries that would decrease the count", () => {
    let capturedOnSubmitted: ((event: SubmittedEvent) => void) | undefined;
    useUnitEventsMock.mockImplementation((args: UseUnitEventsArgs) => {
      capturedOnSubmitted = args.onSubmitted;
    });

    render(
      <LiveProgress
        packageId="0xpkg"
        unitId="0xunit-1"
        initialSubmittedCount={20}
        maxSlots={unitTileCount}
      />,
    );

    act(() => {
      capturedOnSubmitted?.({
        kind: "submitted",
        unitId: "0xunit-1",
        athletePublicId: "1",
        submitter: "0xabc",
        walrusBlobId: [],
        submissionNo: 5,
        submittedCount: 5,
        maxSlots: unitTileCount,
      });
    });

    expect(
      screen.getByText(new RegExp(`20\\s*/\\s*${unitTileCount}`)),
    ).toBeTruthy();
  });

  it("subscribes with the provided packageId and unitId", () => {
    useUnitEventsMock.mockImplementation(() => undefined);

    render(
      <LiveProgress
        packageId="0xpkg"
        unitId="0xunit-1"
        initialSubmittedCount={0}
        maxSlots={unitTileCount}
      />,
    );

    expect(useUnitEventsMock).toHaveBeenCalled();
    const args = useUnitEventsMock.mock.calls[0]?.[0] as UseUnitEventsArgs;
    expect(args.packageId).toBe("0xpkg");
    expect(args.unitId).toBe("0xunit-1");
    expect(typeof args.onSubmitted).toBe("function");
  });

  it("forwards MosaicReadyEvent deliveries through onMosaicReady", () => {
    let capturedOnMosaicReady: ((event: MosaicReadyEvent) => void) | undefined;
    const onMosaicReady = vi.fn();
    useUnitEventsMock.mockImplementation((args: UseUnitEventsArgs) => {
      capturedOnMosaicReady = args.onMosaicReady;
    });

    render(
      <LiveProgress
        initialSubmittedCount={unitTileCount}
        maxSlots={unitTileCount}
        onMosaicReady={onMosaicReady}
        packageId="0xpkg"
        unitId="0xunit-1"
      />,
    );

    act(() => {
      capturedOnMosaicReady?.({
        kind: "mosaicReady",
        unitId: "0xunit-1",
        athletePublicId: "1",
        masterId: "0xmaster-1",
        mosaicWalrusBlobId: [109, 111, 115, 97, 105, 99],
      });
    });

    expect(onMosaicReady).toHaveBeenCalledTimes(1);
    expect(onMosaicReady).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "mosaicReady",
        masterId: "0xmaster-1",
        unitId: "0xunit-1",
      }),
    );
  });

  it("fires /api/finalize once when UnitFilledEvent arrives", async () => {
    let capturedOnFilled: ((event: UnitFilledEvent) => void) | undefined;
    const triggerFinalize = vi.fn(async () => undefined);
    useUnitEventsMock.mockImplementation((args: UseUnitEventsArgs) => {
      capturedOnFilled = args.onFilled;
    });

    render(
      <LiveProgress
        packageId="0xpkg"
        unitId="0xunit-1"
        initialSubmittedCount={unitTileCount}
        maxSlots={unitTileCount}
        triggerFinalize={triggerFinalize}
      />,
    );

    await act(async () => {
      capturedOnFilled?.({
        kind: "filled",
        unitId: "0xunit-1",
        athletePublicId: "1",
        filledCount: unitTileCount,
        maxSlots: unitTileCount,
      });
      await Promise.resolve();
    });

    expect(triggerFinalize).toHaveBeenCalledTimes(1);
    expect(triggerFinalize).toHaveBeenCalledWith("0xunit-1");
  });

  it("does not fire finalize twice for duplicate UnitFilledEvent deliveries", async () => {
    let capturedOnFilled: ((event: UnitFilledEvent) => void) | undefined;
    const triggerFinalize = vi.fn(async () => undefined);
    useUnitEventsMock.mockImplementation((args: UseUnitEventsArgs) => {
      capturedOnFilled = args.onFilled;
    });

    render(
      <LiveProgress
        packageId="0xpkg"
        unitId="0xunit-1"
        initialSubmittedCount={unitTileCount}
        maxSlots={unitTileCount}
        triggerFinalize={triggerFinalize}
      />,
    );

    await act(async () => {
      const event: UnitFilledEvent = {
        kind: "filled",
        unitId: "0xunit-1",
        athletePublicId: "1",
        filledCount: unitTileCount,
        maxSlots: unitTileCount,
      };
      capturedOnFilled?.(event);
      capturedOnFilled?.(event);
      await Promise.resolve();
    });

    expect(triggerFinalize).toHaveBeenCalledTimes(1);
  });
});
