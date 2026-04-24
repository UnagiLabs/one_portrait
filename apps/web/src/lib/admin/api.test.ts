import { describe, expect, it } from "vitest";

import {
  ADMIN_MUTATION_HEADER,
  ADMIN_MUTATION_HEADER_VALUE,
  AdminApiError,
  assertAdminMutationRequest,
  parseCreateUnitInput,
} from "./api";

describe("parseCreateUnitInput", () => {
  it("accepts create-unit input without athleteId", () => {
    expect(
      parseCreateUnitInput({
        blobId: "target-blob-12",
        displayMaxSlots: 2000,
        displayName: "Demo Athlete Twelve",
        maxSlots: 2000,
        thumbnailUrl: "https://example.com/12.png",
      }),
    ).toEqual({
      blobId: "target-blob-12",
      displayMaxSlots: 2000,
      displayName: "Demo Athlete Twelve",
      maxSlots: 2000,
      thumbnailUrl: "https://example.com/12.png",
    });
  });

  it("rejects create-unit input that still includes athleteId", () => {
    expect(() =>
      parseCreateUnitInput({
        athleteId: 12,
        blobId: "target-blob-12",
        displayMaxSlots: 2000,
        displayName: "Demo Athlete Twelve",
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
