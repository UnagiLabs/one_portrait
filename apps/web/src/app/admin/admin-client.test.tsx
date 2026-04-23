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

const HEALTH_OK = {
  currentUrl: "https://generator.example.com",
  dispatchAuthorization: { httpStatus: 200, status: "ok" } as const,
  generatorReadiness: { httpStatus: 200, status: "ok" } as const,
  resolutionStatus: "ok" as const,
  source: "runtime_state" as const,
};

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
            metadataState: "ready",
            slug: "demo-athlete-one",
            thumbnailUrl: "https://example.com/1.png",
          },
        ]}
        initialHealth={HEALTH_OK}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Demo Athlete One" }),
    ).toBeTruthy();
    expect(screen.getByText(/target-blob-1/)).toBeTruthy();
    expect(screen.getByText(/registered/)).toBeTruthy();
    expect(screen.getAllByText("ok")).toHaveLength(3);
    expect(screen.getByText("https://generator.example.com")).toBeTruthy();
    expect(screen.getByText("runtime_state")).toBeTruthy();
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
            displayName: "Athlete #1",
            lookupState: "missing",
            metadataState: "missing",
            slug: "athlete-1",
            thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
          },
        ]}
        initialHealth={HEALTH_OK}
      />,
    );

    const input = screen.getByLabelText(/対象画像/) as HTMLInputElement;
    const file = new File(["target"], "target.jpg", { type: "image/jpeg" });

    fireEvent.change(input, {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("target-blob-9")).toBeTruthy();
    });
    expect(
      screen.getByAltText("アップロードした対象画像のプレビュー"),
    ).toBeTruthy();
  });

  it("submits athlete metadata and records the latest action", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.endsWith("/api/admin/upsert-athlete-metadata")) {
        return new Response(
          JSON.stringify({
            athleteId: 7,
            digest: "0xmetadata",
            status: "upserted",
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
                athletePublicId: "7",
                currentUnit: null,
                displayName: "Demo Athlete Seven",
                lookupState: "missing",
                metadataState: "ready",
                slug: "demo-athlete-seven",
                thumbnailUrl: "https://example.com/7.png",
              },
            ],
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }

      return new Response(JSON.stringify(HEALTH_OK), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });

    render(<AdminClient initialAthletes={[]} initialHealth={HEALTH_OK} />);

    const athleteIdInput = screen.getAllByLabelText(/^athlete ID$/i)[0];
    if (!athleteIdInput) {
      throw new Error("metadata athlete ID input not found");
    }

    fireEvent.change(athleteIdInput, {
      target: { value: "7" },
    });
    fireEvent.change(screen.getByLabelText(/displayName/), {
      target: { value: "Demo Athlete Seven" },
    });
    fireEvent.change(screen.getByLabelText(/^slug$/i), {
      target: { value: "demo-athlete-seven" },
    });
    fireEvent.change(screen.getByLabelText(/thumbnail URL/i), {
      target: { value: "https://example.com/7.png" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /metadata を登録 \/ 更新/ }),
    );

    await waitFor(() => {
      expect(screen.getByText("athlete metadata を更新しました")).toBeTruthy();
    });
    expect(screen.getByText(/ダイジェスト: 0xmetadata/)).toBeTruthy();
    expect(screen.getByText(/athlete ID: 7/)).toBeTruthy();
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
                metadataState: "ready",
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

      return new Response(JSON.stringify(HEALTH_OK), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });

    render(
      <AdminClient
        initialAthletes={[
          {
            athletePublicId: "1",
            currentUnit: null,
            displayName: "Demo Athlete One",
            lookupState: "missing",
            metadataState: "ready",
            slug: "demo-athlete-one",
            thumbnailUrl: "https://example.com/1.png",
          },
        ]}
        initialHealth={HEALTH_OK}
      />,
    );

    fireEvent.change(screen.getByLabelText(/対象 blob ID/), {
      target: { value: "target-blob-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ユニットを作成/ }));

    await waitFor(() => {
      expect(screen.getByText("ユニットを作成しました")).toBeTruthy();
    });
    expect(screen.getByText(/ダイジェスト: 0xcreate/)).toBeTruthy();
  });
});
