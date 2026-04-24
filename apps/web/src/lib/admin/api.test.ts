import { describe, expect, it } from "vitest";

import {
  ADMIN_MUTATION_HEADER,
  ADMIN_MUTATION_HEADER_VALUE,
  AdminApiError,
  assertAdminMutationRequest,
  parseCreateUnitInput,
} from "./api";

describe("parseCreateUnitInput", () => {
  it("accepts create-unit input with athleteSlug", () => {
    expect(
      parseCreateUnitInput({
        athleteSlug: "demo-athlete-twelve",
        blobId: "target-blob-12",
        displayMaxSlots: 2000,
        maxSlots: 2000,
      }),
    ).toEqual({
      athleteSlug: "demo-athlete-twelve",
      blobId: "target-blob-12",
      displayMaxSlots: 2000,
      maxSlots: 2000,
    });
  });

  it("accepts zero real upload slots for a demo unit", () => {
    expect(
      parseCreateUnitInput({
        athleteSlug: "demo-athlete-twelve",
        blobId: "target-blob-12",
        displayMaxSlots: 2000,
        maxSlots: 0,
      }),
    ).toEqual({
      athleteSlug: "demo-athlete-twelve",
      blobId: "target-blob-12",
      displayMaxSlots: 2000,
      maxSlots: 0,
    });
  });

  it("rejects a zero display slot unit", () => {
    expect(() =>
      parseCreateUnitInput({
        athleteSlug: "demo-athlete-twelve",
        blobId: "target-blob-12",
        displayMaxSlots: 0,
        maxSlots: 0,
      }),
    ).toThrowError(AdminApiError);
  });

  it("rejects create-unit input that still includes athleteId", () => {
    expect(() =>
      parseCreateUnitInput({
        athleteId: 12,
        athleteSlug: "demo-athlete-twelve",
        blobId: "target-blob-12",
        displayMaxSlots: 2000,
        maxSlots: 2000,
      }),
    ).toThrowError(AdminApiError);
  });

  it("rejects client-provided displayName", () => {
    expect(() =>
      parseCreateUnitInput({
        athleteSlug: "demo-athlete-twelve",
        blobId: "target-blob-12",
        displayMaxSlots: 2000,
        displayName: "Demo Athlete Twelve",
        maxSlots: 2000,
      }),
    ).toThrowError(AdminApiError);
  });

  it("rejects client-provided thumbnailUrl", () => {
    expect(() =>
      parseCreateUnitInput({
        athleteSlug: "demo-athlete-twelve",
        blobId: "target-blob-12",
        displayMaxSlots: 2000,
        maxSlots: 2000,
        thumbnailUrl: "https://example.com/12.png",
      }),
    ).toThrowError(AdminApiError);
  });
});

describe("assertAdminMutationRequest", () => {
  it("accepts same-origin browser requests marked by the admin client", () => {
    expect(() =>
      assertAdminMutationRequest(
        new Request("http://localhost/api/admin/create-unit", {
          headers: {
            [ADMIN_MUTATION_HEADER]: ADMIN_MUTATION_HEADER_VALUE,
            "sec-fetch-site": "same-origin",
          },
          method: "POST",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects requests without the admin client marker header", () => {
    expect(() =>
      assertAdminMutationRequest(
        new Request("http://localhost/api/admin/create-unit", {
          method: "POST",
        }),
      ),
    ).toThrowError(AdminApiError);
  });

  it("rejects requests explicitly marked as cross-site", () => {
    expect(() =>
      assertAdminMutationRequest(
        new Request("http://localhost/api/admin/create-unit", {
          headers: {
            [ADMIN_MUTATION_HEADER]: ADMIN_MUTATION_HEADER_VALUE,
            "sec-fetch-site": "cross-site",
          },
          method: "POST",
        }),
      ),
    ).toThrowError(AdminApiError);
  });
});
