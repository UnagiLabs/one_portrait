import { describe, expect, it } from "vitest";
import type { AthleteCatalogEntry, AthleteChainRef } from "./index";
import {
  getAthleteBySlug,
  getAthleteByUnitId,
  getAthleteCatalog,
} from "./index";

describe("getAthleteCatalog", () => {
  it("returns the 11 home rail athlete entries", async () => {
    const catalog = await getAthleteCatalog();

    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog).toHaveLength(11);
  });

  it("gives every entry the required home rail display fields", async () => {
    const catalog = await getAthleteCatalog();

    for (const entry of catalog) {
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.slug.length).toBeGreaterThan(0);
      expect(entry.thumbnailUrl.length).toBeGreaterThan(0);
      expect(entry.region?.length).toBeGreaterThan(0);
      expect(entry.status?.length).toBeGreaterThan(0);
    }
  });

  it("has unique slugs across entries", async () => {
    const catalog = await getAthleteCatalog();
    const slugs = new Set(catalog.map((entry) => entry.slug));

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

    await expect(getAthleteBySlug(first.slug)).resolves.toEqual(first);
  });

  it("returns undefined for an unknown slug", async () => {
    await expect(
      getAthleteBySlug("does-not-exist-xyz"),
    ).resolves.toBeUndefined();
  });
});

describe("getAthleteByUnitId", () => {
  it("returns the matching entry when the unit exists", async () => {
    const catalog = await getAthleteCatalog();
    const first = catalog[0];
    if (!first) {
      expect.unreachable("catalog should not be empty");
      return;
    }
    if (!first.unitId) {
      expect.unreachable("first catalog entry should have a unitId");
      return;
    }

    await expect(getAthleteByUnitId(first.unitId)).resolves.toEqual(first);
  });

  it("returns undefined for an unknown unit", async () => {
    await expect(getAthleteByUnitId("0x999999")).resolves.toBeUndefined();
  });
});

describe("AthleteChainRef", () => {
  it("accepts only unitId", () => {
    const ref: AthleteChainRef = {
      unitId: "0xabc",
    };

    expect(ref.unitId).toBe("0xabc");
  });

  it("allows unitId to be null before a Unit is created", () => {
    const ref: AthleteChainRef = {
      unitId: null,
    };

    expect(ref.unitId).toBeNull();
  });

  it("keeps display metadata out of chain ref (type-level assertion)", () => {
    const chainOnly: AthleteChainRef = {
      unitId: null,
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
    expect(chainOnly.unitId).toBeNull();
  });
});

describe("AthleteCatalogEntry", () => {
  it("keeps unitId optional for catalog-only home rail entries", () => {
    const entry: AthleteCatalogEntry = {
      slug: "example",
      displayName: "Example Athlete",
      thumbnailUrl: "https://example.invalid/thumb.jpg",
      region: "Example Region",
      status: "Opening soon",
    };

    expect(entry.unitId).toBeUndefined();
  });
});
