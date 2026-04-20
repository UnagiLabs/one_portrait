import { describe, expect, it } from "vitest";
import type { AthleteCatalogEntry, AthleteChainRef } from "./index";
import {
  getAthleteByPublicId,
  getAthleteBySlug,
  getAthleteCatalog,
} from "./index";

describe("getAthleteCatalog", () => {
  it("returns at least two athlete entries for MVP demo", async () => {
    const catalog = await getAthleteCatalog();

    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThanOrEqual(2);
  });

  it("gives every entry the required display fields", async () => {
    const catalog = await getAthleteCatalog();

    for (const entry of catalog) {
      expect(typeof entry.athletePublicId).toBe("string");
      expect(entry.athletePublicId.length).toBeGreaterThan(0);
      expect(typeof entry.displayName).toBe("string");
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(typeof entry.slug).toBe("string");
      expect(entry.slug.length).toBeGreaterThan(0);
      expect(typeof entry.thumbnailUrl).toBe("string");
      expect(entry.thumbnailUrl.length).toBeGreaterThan(0);
    }
  });

  it("keeps athletePublicId as a decimal string that matches on-chain u16", async () => {
    const catalog = await getAthleteCatalog();

    for (const entry of catalog) {
      expect(entry.athletePublicId).toMatch(/^[0-9]+$/);
      const numeric = Number(entry.athletePublicId);
      expect(Number.isInteger(numeric)).toBe(true);
      expect(numeric).toBeGreaterThanOrEqual(0);
      expect(numeric).toBeLessThanOrEqual(65_535);
    }
  });

  it("has unique athletePublicId and slug across entries", async () => {
    const catalog = await getAthleteCatalog();
    const ids = new Set(catalog.map((entry) => entry.athletePublicId));
    const slugs = new Set(catalog.map((entry) => entry.slug));

    expect(ids.size).toBe(catalog.length);
    expect(slugs.size).toBe(catalog.length);
  });
});

describe("getAthleteBySlug", () => {
  it("returns the matching entry when the slug exists", async () => {
    const catalog = await getAthleteCatalog();
    const first = catalog[0];
    if (!first) {
      expect.unreachable("catalog should not be empty");
      return;
    }

    const found = await getAthleteBySlug(first.slug);

    expect(found).toEqual(first);
  });

  it("returns undefined for an unknown slug", async () => {
    const found = await getAthleteBySlug("does-not-exist-xyz");

    expect(found).toBeUndefined();
  });
});

describe("getAthleteByPublicId", () => {
  it("returns the matching entry when the id exists", async () => {
    const catalog = await getAthleteCatalog();
    const first = catalog[0];
    if (!first) {
      expect.unreachable("catalog should not be empty");
      return;
    }

    const found = await getAthleteByPublicId(first.athletePublicId);

    expect(found).toEqual(first);
  });

  it("returns undefined for an unknown public id", async () => {
    const found = await getAthleteByPublicId("999999");

    expect(found).toBeUndefined();
  });
});

describe("AthleteChainRef (on-chain place-holder)", () => {
  it("accepts only athletePublicId and currentUnitId", () => {
    const ref: AthleteChainRef = {
      athletePublicId: "1",
      currentUnitId: "0xabc",
    };

    expect(ref.athletePublicId).toBe("1");
    expect(ref.currentUnitId).toBe("0xabc");
  });

  it("allows currentUnitId to be null before a Unit is created", () => {
    const ref: AthleteChainRef = {
      athletePublicId: "2",
      currentUnitId: null,
    };

    expect(ref.currentUnitId).toBeNull();
  });

  it("keeps display metadata out of chain ref (type-level assertion)", () => {
    // This test encodes the boundary contract: AthleteChainRef must not
    // carry any display meta. If someone adds displayName / slug / thumbnailUrl
    // to AthleteChainRef, the `@ts-expect-error` lines below will become
    // unused and fail the build, catching the regression at compile time.
    const chainOnly: AthleteChainRef = {
      athletePublicId: "3",
      currentUnitId: null,
    };

    // @ts-expect-error displayName must live only on AthleteCatalogEntry
    const _displayName: string = chainOnly.displayName;
    // @ts-expect-error slug must live only on AthleteCatalogEntry
    const _slug: string = chainOnly.slug;
    // @ts-expect-error thumbnailUrl must live only on AthleteCatalogEntry
    const _thumbnail: string = chainOnly.thumbnailUrl;

    void _displayName;
    void _slug;
    void _thumbnail;
    expect(chainOnly.athletePublicId).toBe("3");
  });
});

describe("AthleteCatalogEntry", () => {
  it("is structurally independent from AthleteChainRef", () => {
    // The two types share only `athletePublicId`. This test documents that
    // contract by constructing both from the same id and asserting only the
    // shared field overlaps.
    const entry: AthleteCatalogEntry = {
      athletePublicId: "42",
      slug: "example",
      displayName: "Example Athlete",
      thumbnailUrl: "https://example.invalid/thumb.jpg",
    };
    const ref: AthleteChainRef = {
      athletePublicId: "42",
      currentUnitId: null,
    };

    expect(entry.athletePublicId).toBe(ref.athletePublicId);
  });
});
