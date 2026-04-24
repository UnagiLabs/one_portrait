// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
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

  it("renders initial unit cards and health", () => {
    render(
      <AdminClient
        initialAthletes={[
          {
            athletePublicId: "1",
            currentUnit: {
              athletePublicId: "1",
              displayMaxSlots: 2000,
              displayName: "Demo Athlete One",
              masterId: null,
              maxSlots: 2000,
              realSubmittedCount: 2000,
              status: "filled",
              submittedCount: 2000,
              targetWalrusBlobId: "target-blob-1",
              thumbnailUrl: "https://example.com/1.png",
              unitId: "0xunit-1",
            },
            displayName: "Demo Athlete One",
            entryId: "0xunit-1",
            lookupState: "ready",
            metadataState: "ready",
            slug: "unit-unit-1",
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
    expect(screen.getAllByText(/2000 \/ 2000/)).toHaveLength(2);
    expect(screen.getByText("normal")).toBeTruthy();
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

    render(<AdminClient initialAthletes={[]} initialHealth={HEALTH_OK} />);

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

  it("submits a normal unit with full display slots", async () => {
    vi.stubGlobal("fetch", fetchMock);
    let createPayload: Record<string, unknown> | null = null;

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.endsWith("/api/admin/create-unit")) {
          createPayload = JSON.parse(String(init?.body ?? "{}")) as Record<
            string,
            unknown
          >;
          return new Response(
            JSON.stringify({
              digest: "0xcreate",
              status: "created",
              unitId: "0xunit-created",
            }),
            {
              headers: { "content-type": "application/json" },
              status: 200,
            },
          );
        }

        if (url.endsWith("/api/admin/status")) {
          return new Response(JSON.stringify({ athletes: [] }), {
            headers: { "content-type": "application/json" },
            status: 200,
          });
        }

        return new Response(JSON.stringify(HEALTH_OK), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    );

    render(
      <AdminClient
        initialAthletes={[
          {
            athletePublicId: "7",
            currentUnit: null,
            displayName: "Demo Athlete Seven",
            entryId: "draft-7",
            lookupState: "ready",
            metadataState: "ready",
            slug: "unit-draft-7",
            thumbnailUrl: "https://example.com/7.png",
          },
        ]}
        initialHealth={HEALTH_OK}
      />,
    );

    expect(screen.queryByLabelText(/athlete ID/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/対象 blob ID/), {
      target: { value: "target-blob-7" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ユニットを作成/ }));

    await waitFor(() => {
      expect(screen.getByText("ユニットを作成しました")).toBeTruthy();
    });
    expect(screen.getByText(/ユニットID: 0xunit-created/)).toBeTruthy();
    expect(screen.getByText(/ステータス: created/)).toBeTruthy();
    expect(screen.queryByText(/athlete ID: 7/)).toBeNull();
    expect(createPayload).toEqual({
      blobId: "target-blob-7",
      displayMaxSlots: unitTileCount,
      displayName: "Demo Athlete Seven",
      maxSlots: unitTileCount,
      thumbnailUrl: "https://example.com/7.png",
    });
  });

  it("submits a demo unit with reduced real upload count", async () => {
    vi.stubGlobal("fetch", fetchMock);
    let createPayload: Record<string, unknown> | null = null;

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.endsWith("/api/admin/create-unit")) {
          createPayload = JSON.parse(String(init?.body ?? "{}")) as Record<
            string,
            unknown
          >;
          return new Response(
            JSON.stringify({
              digest: "0xcreate-demo",
              status: "created",
              unitId: "0xunit-demo",
            }),
            {
              headers: { "content-type": "application/json" },
              status: 200,
            },
          );
        }

        if (url.endsWith("/api/admin/status")) {
          return new Response(JSON.stringify({ athletes: [] }), {
            headers: { "content-type": "application/json" },
            status: 200,
          });
        }

        return new Response(JSON.stringify(HEALTH_OK), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      },
    );

    render(
      <AdminClient
        initialAthletes={[
          {
            athletePublicId: "12",
            currentUnit: null,
            displayName: "Demo Athlete Twelve",
            entryId: "draft-12",
            lookupState: "ready",
            metadataState: "ready",
            slug: "unit-draft-12",
            thumbnailUrl: "https://example.com/12.png",
          },
        ]}
        initialHealth={HEALTH_OK}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /デモ/ }));
    fireEvent.change(screen.getByLabelText("デモ実アップロード枚数"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText(/対象 blob ID/), {
      target: { value: "target-blob-demo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ユニットを作成/ }));

    await waitFor(() => {
      expect(screen.getByText("ユニットを作成しました")).toBeTruthy();
    });
    expect(createPayload).toEqual({
      blobId: "target-blob-demo",
      displayMaxSlots: unitTileCount,
      displayName: "Demo Athlete Twelve",
      maxSlots: 5,
      thumbnailUrl: "https://example.com/12.png",
    });
  });
});
