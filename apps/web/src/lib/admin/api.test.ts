import { describe, expect, it } from "vitest";

import {
  ADMIN_MUTATION_HEADER,
  ADMIN_MUTATION_HEADER_VALUE,
  AdminApiError,
  assertAdminMutationRequest,
  parseCreateUnitInput,
} from "./api";

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

describe("parseCreateUnitInput", () => {
  it("defaults displayMaxSlots to maxSlots when the field is omitted", () => {
    expect(
      parseCreateUnitInput({
        athleteId: 12,
        blobId: "target-blob-12",
        maxSlots: 2000,
      }),
    ).toEqual({
      athleteId: 12,
      blobId: "target-blob-12",
      displayMaxSlots: 2000,
      maxSlots: 2000,
    });
  });

  it("rejects displayMaxSlots values smaller than maxSlots", () => {
    expect(() =>
      parseCreateUnitInput({
        athleteId: 12,
        blobId: "target-blob-12",
        displayMaxSlots: 1999,
        maxSlots: 2000,
      }),
    ).toThrowError(AdminApiError);
  });
});
