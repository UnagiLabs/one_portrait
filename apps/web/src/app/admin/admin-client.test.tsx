// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { preprocessPhotoMock, putTargetBlobToWalrusMock } = vi.hoisted(() => ({
  preprocessPhotoMock: vi.fn(),
  putTargetBlobToWalrusMock: vi.fn(),
}));

vi.mock("../../lib/image/preprocess", () => ({
  preprocessPhoto: preprocessPhotoMock,
}));

vi.mock("../../lib/walrus/put-target", () => ({
  putTargetBlobToWalrus: putTargetBlobToWalrusMock,
}));

import { AdminClient } from "./admin-client";

describe("AdminClient", () => {
  const fetchMock = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    preprocessPhotoMock.mockReset();
    putTargetBlobToWalrusMock.mockReset();
  });

  it("renders initial athlete cards and health", () => {
    render(
      <AdminClient
        initialAthletes={[
          {
            athletePublicId: "1",
            currentUnit: {
              athletePublicId: "1",
              masterId: null,
              maxSlots: 980,
              status: "filled",
              submittedCount: 980,
              targetWalrusBlobId: "target-blob-1",
              unitId: "0xunit-1",
            },
            displayName: "Demo Athlete One",
            lookupState: "ready",
            slug: "demo-athlete-one",
            thumbnailUrl: "https://example.com/1.png",
          },
        ]}
        initialHealth={{
          dispatchAuthorization: { httpStatus: 200, status: "ok" },
          generatorReadiness: { httpStatus: 200, status: "ok" },
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Demo Athlete One" }),
    ).toBeTruthy();
    expect(screen.getByText(/target-blob-1/)).toBeTruthy();
    expect(screen.getAllByText("ok")).toHaveLength(2);
  });

  it("uploads a target image and shows the blob id", async () => {
    preprocessPhotoMock.mockResolvedValue({
      blob: new Blob(["target"], { type: "image/jpeg" }),
      contentType: "image/jpeg",
      height: 768,
      previewUrl: "blob:preview-target",
      sha256: "a".repeat(64),
      width: 1024,
    });
    putTargetBlobToWalrusMock.mockResolvedValue({
      aggregatorUrl: "https://aggregator.example.com/v1/blobs/target-blob-9",
      blobId: "target-blob-9",
    });

    render(
      <AdminClient
        initialAthletes={[
          {
            athletePublicId: "1",
            currentUnit: null,
            displayName: "Demo Athlete One",
            lookupState: "missing",
            slug: "demo-athlete-one",
            thumbnailUrl: "https://example.com/1.png",
          },
        ]}
        initialHealth={{
          dispatchAuthorization: { httpStatus: 200, status: "ok" },
          generatorReadiness: { httpStatus: 200, status: "ok" },
        }}
      />,
    );

    const input = screen.getByLabelText(/target image/i) as HTMLInputElement;
    const file = new File(["target"], "target.jpg", { type: "image/jpeg" });

    fireEvent.change(input, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("target-blob-9")).toBeTruthy();
    });
    expect(screen.getByAltText("Uploaded target preview")).toBeTruthy();
  });

  it("submits create-unit and records the latest action", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.endsWith("/api/admin/create-unit")) {
        return new Response(
          JSON.stringify({
            digest: "0xcreate",
            status: "created",
            unitId:
              "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }

      if (url.endsWith("/api/admin/status")) {
        return new Response(
          JSON.stringify({
            athletes: [
              {
                athletePublicId: "1",
                currentUnit: null,
                displayName: "Demo Athlete One",
                lookupState: "missing",
                slug: "demo-athlete-one",
                thumbnailUrl: "https://example.com/1.png",
              },
            ],
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }

      return new Response(
        JSON.stringify({
          dispatchAuthorization: { httpStatus: 200, status: "ok" },
          generatorReadiness: { httpStatus: 200, status: "ok" },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    });

    render(
      <AdminClient
        initialAthletes={[
          {
            athletePublicId: "1",
            currentUnit: null,
            displayName: "Demo Athlete One",
            lookupState: "missing",
            slug: "demo-athlete-one",
            thumbnailUrl: "https://example.com/1.png",
          },
        ]}
        initialHealth={{
          dispatchAuthorization: { httpStatus: 200, status: "ok" },
          generatorReadiness: { httpStatus: 200, status: "ok" },
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/target blob id/i), {
      target: { value: "target-blob-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create unit/i }));

    await waitFor(() => {
      expect(screen.getByText("Create unit completed")).toBeTruthy();
    });
    expect(screen.getByText(/digest: 0xcreate/)).toBeTruthy();
  });
});
