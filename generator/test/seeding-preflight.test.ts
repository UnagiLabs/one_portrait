import { describe, expect, it } from "vitest";

import type { GeneratorSeedingSnapshot } from "../src";
import { validateSeedingPreflight } from "../src";

describe("validateSeedingPreflight", () => {
  it("rejects units that are not pending", () => {
    expect(() =>
      validateSeedingPreflight(
        snapshot({ status: "filled" }),
        3,
        ["0xsender-1", "0xsender-2"],
      ),
    ).toThrow(/pending/);
  });

  it("rejects targetCount values that are greater than or equal to maxSlots", () => {
    expect(() =>
      validateSeedingPreflight(snapshot(), 5, ["0xsender-1", "0xsender-2"]),
    ).toThrow(/maxSlots/);
  });

  it("rejects targetCount values below the current submittedCount", () => {
    expect(() =>
      validateSeedingPreflight(
        snapshot({ submittedCount: 3 }),
        2,
        ["0xsender-1", "0xsender-2"],
      ),
    ).toThrow(/submittedCount/);
  });

  it("rejects duplicate sender addresses in the pool", () => {
    expect(() =>
      validateSeedingPreflight(
        snapshot(),
        3,
        ["0xsender-1", "0xsender-1"],
      ),
    ).toThrow(/duplicate/i);
  });

  it("rejects pools that do not contain enough unused senders after excluding on-chain submitters", () => {
    expect(() =>
      validateSeedingPreflight(
        snapshot({
          submittedCount: 1,
          submitterAddresses: ["0xused-1"],
        }),
        4,
        ["0xused-1", "0xsender-1", "0xsender-2"],
      ),
    ).toThrow(/remainingCount/i);
  });

  it("returns filtered available senders and the remaining count", () => {
    const result = validateSeedingPreflight(
      snapshot({
        submittedCount: 2,
        submitterAddresses: ["0xused-1", "0xused-2"],
      }),
      4,
      ["0xused-1", "0xsender-1", "0xsender-2", "0xsender-3"],
    );

    expect(result).toEqual({
      targetCount: 4,
      remainingCount: 2,
      availableSenderAddresses: [
        "0xsender-1",
        "0xsender-2",
        "0xsender-3",
      ],
      currentSubmittedCount: 2,
      maxSlots: 5,
    });
  });
});

function snapshot(
  overrides: Partial<GeneratorSeedingSnapshot> = {},
): GeneratorSeedingSnapshot {
  return {
    athleteId: overrides.athleteId ?? 1,
    targetWalrusBlobId: overrides.targetWalrusBlobId ?? "target-blob",
    unitId: overrides.unitId ?? "0xunit-1",
    submissions: overrides.submissions ?? [],
    submittedCount: overrides.submittedCount ?? 1,
    maxSlots: overrides.maxSlots ?? 5,
    status: overrides.status ?? "pending",
    masterId: overrides.masterId ?? null,
    submitterAddresses: overrides.submitterAddresses ?? ["0xused-1"],
  };
}
