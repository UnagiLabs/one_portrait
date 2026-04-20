import { describe, expect, it } from "vitest";

import {
  parseMosaicReadyEvent,
  parseSubmittedEvent,
  parseUnitFilledEvent,
} from "./event-types";

const UNIT_ID = "0xunit-1";
const ATHLETE_ID = 7;
const SUBMITTER = "0xsubmitter";
const MASTER_ID = "0xmaster";

function submittedRaw(overrides: Record<string, unknown> = {}) {
  return {
    type: "0xpkg::events::SubmittedEvent",
    parsedJson: {
      unit_id: UNIT_ID,
      athlete_id: ATHLETE_ID,
      submitter: SUBMITTER,
      walrus_blob_id: [1, 2, 3],
      submission_no: "1",
      submitted_count: "1",
      max_slots: "500",
      ...overrides,
    },
  };
}

function unitFilledRaw(overrides: Record<string, unknown> = {}) {
  return {
    type: "0xpkg::events::UnitFilledEvent",
    parsedJson: {
      unit_id: UNIT_ID,
      athlete_id: ATHLETE_ID,
      filled_count: "500",
      max_slots: "500",
      ...overrides,
    },
  };
}

function mosaicReadyRaw(overrides: Record<string, unknown> = {}) {
  return {
    type: "0xpkg::events::MosaicReadyEvent",
    parsedJson: {
      unit_id: UNIT_ID,
      athlete_id: ATHLETE_ID,
      master_id: MASTER_ID,
      mosaic_walrus_blob_id: [9, 8, 7],
      ...overrides,
    },
  };
}

describe("parseSubmittedEvent", () => {
  it("returns a normalized SubmittedEvent from raw SDK payload", () => {
    const event = parseSubmittedEvent(submittedRaw());

    expect(event).toEqual({
      kind: "submitted",
      unitId: UNIT_ID,
      athletePublicId: "7",
      submitter: SUBMITTER,
      walrusBlobId: [1, 2, 3],
      submissionNo: 1,
      submittedCount: 1,
      maxSlots: 500,
    });
  });

  it("accepts numeric or string u64 fields", () => {
    const event = parseSubmittedEvent(
      submittedRaw({ submission_no: 42, submitted_count: 42, max_slots: 500 }),
    );

    expect(event.submissionNo).toBe(42);
    expect(event.submittedCount).toBe(42);
    expect(event.maxSlots).toBe(500);
  });

  it("throws when required fields are missing", () => {
    expect(() =>
      parseSubmittedEvent({ type: "x", parsedJson: { unit_id: UNIT_ID } }),
    ).toThrow();
  });
});

describe("parseUnitFilledEvent", () => {
  it("returns a normalized UnitFilledEvent", () => {
    const event = parseUnitFilledEvent(unitFilledRaw());

    expect(event).toEqual({
      kind: "filled",
      unitId: UNIT_ID,
      athletePublicId: "7",
      filledCount: 500,
      maxSlots: 500,
    });
  });

  it("throws when required fields are missing", () => {
    expect(() =>
      parseUnitFilledEvent({ type: "x", parsedJson: { unit_id: UNIT_ID } }),
    ).toThrow();
  });
});

describe("parseMosaicReadyEvent", () => {
  it("returns a normalized MosaicReadyEvent", () => {
    const event = parseMosaicReadyEvent(mosaicReadyRaw());

    expect(event).toEqual({
      kind: "mosaicReady",
      unitId: UNIT_ID,
      athletePublicId: "7",
      masterId: MASTER_ID,
      mosaicWalrusBlobId: [9, 8, 7],
    });
  });

  it("throws when required fields are missing", () => {
    expect(() =>
      parseMosaicReadyEvent({ type: "x", parsedJson: { unit_id: UNIT_ID } }),
    ).toThrow();
  });
});
