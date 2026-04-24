// @vitest-environment happy-dom

import { unitTileCount } from "@one-portrait/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import testnetDeploymentManifest from "../../../../../ops/deployments/testnet.json";

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
  expectedDeployment: {
    network: "testnet",
    packageId: testnetDeploymentManifest.packageId,
  },
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
            currentUnit: {
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

  it("renders admin health warning details", () => {
    render(
      <AdminClient
        initialAthletes={[]}
        initialHealth={{
          ...HEALTH_OK,
          dispatchAuthorization: {
            httpStatus: 503,
            message: "dispatch worker cannot reach generator queue",
            status: "unreachable",
          },
          resolutionStatus: "misconfigured",
          runtimeWarning:
            "Worker KV runtime state is stale. Falling back to localhost.",
          source: "fallback",
        }}
      />,
    );

    expect(
      screen.getByText(
        "Worker KV runtime state is stale. Falling back to localhost.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("dispatch worker cannot reach generator queue"),
    ).toBeTruthy();
  });

  it("shows finalize retry failure details returned by the admin API", async () => {
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (url.endsWith("/api/admin/finalize")) {
        return new Response(
          JSON.stringify({
            code: "generator_error",
            message: "mosaic source missing",
            status: "ignored_dispatch_failed",
            unitId: "0xunit-1",
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
    });

    render(
      <AdminClient
        initialAthletes={[
          {
            currentUnit: {
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

    fireEvent.click(screen.getByRole("button", { name: /Retry finalize/ }));

    await waitFor(() => {
      expect(screen.getByText("Finalize retry failed")).toBeTruthy();
    });
    expect(screen.getByText(/Code: generator_error/)).toBeTruthy();
    expect(screen.getByText(/Reason: mosaic source missing/)).toBeTruthy();
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

    const input = screen.getByLabelText(/Target image/) as HTMLInputElement;
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

    expect(screen.queryByLabelText(/unit ID/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Target blob ID/), {
      target: { value: "target-blob-7" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create unit/ }));

    await waitFor(() => {
      expect(screen.getByText("Unit created")).toBeTruthy();
    });
    expect(screen.getByText(/Unit ID: 0xunit-created/)).toBeTruthy();
    expect(screen.getByText(/Status: created/)).toBeTruthy();
    expect(screen.queryByText(/unit ID: 7/)).toBeNull();
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

    fireEvent.click(screen.getByRole("radio", { name: /Demo/ }));
    fireEvent.change(screen.getByLabelText("Demo real upload count"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText(/Target blob ID/), {
      target: { value: "target-blob-demo" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create unit/ }));

    await waitFor(() => {
      expect(screen.getByText("Unit created")).toBeTruthy();
    });
    expect(createPayload).toEqual({
      blobId: "target-blob-demo",
      displayMaxSlots: unitTileCount,
      displayName: "Demo Athlete Twelve",
      maxSlots: 5,
      thumbnailUrl: "https://example.com/12.png",
    });
  });

  it("submits a zero-upload demo unit", async () => {
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
              digest: "0xcreate-demo-zero",
              status: "created",
              unitId: "0xunit-demo-zero",
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
            currentUnit: null,
            displayName: "Demo Athlete Zero",
            entryId: "draft-0",
            lookupState: "ready",
            metadataState: "ready",
            slug: "unit-draft-0",
            thumbnailUrl: "https://example.com/0.png",
          },
        ]}
        initialHealth={HEALTH_OK}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Demo/ }));
    fireEvent.change(screen.getByLabelText("Demo real upload count"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText(/Target blob ID/), {
      target: { value: "target-blob-demo-zero" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create unit/ }));

    await waitFor(() => {
      expect(screen.getByText("Unit created")).toBeTruthy();
    });
    expect(
      screen.getByText(/Treat as filled immediately after creating 0 photos/),
    ).toBeTruthy();
    expect(createPayload).toEqual({
      blobId: "target-blob-demo-zero",
      displayMaxSlots: unitTileCount,
      displayName: "Demo Athlete Zero",
      maxSlots: 0,
      thumbnailUrl: "https://example.com/0.png",
    });
  });
});
