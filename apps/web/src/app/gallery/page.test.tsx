// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getAthleteCatalogMock,
  getDemoGalleryEntriesMock,
  isDemoModeEnabledMock,
  loadPublicEnvMock,
  galleryClientMock,
} = vi.hoisted(() => ({
  getAthleteCatalogMock: vi.fn(),
  getDemoGalleryEntriesMock: vi.fn(),
  isDemoModeEnabledMock: vi.fn(),
  loadPublicEnvMock: vi.fn(),
  galleryClientMock: vi.fn(),
}));

vi.mock("../../lib/catalog", () => ({
  getAthleteCatalog: getAthleteCatalogMock,
}));

vi.mock("../../lib/env", () => ({
  loadPublicEnv: loadPublicEnvMock,
}));

vi.mock("../../lib/demo", () => ({
  getDemoGalleryEntries: getDemoGalleryEntriesMock,
  isDemoModeEnabled: isDemoModeEnabledMock,
}));

vi.mock("./gallery-client", () => ({
  GalleryClient: ({
    catalog,
    demoEntries,
    packageId,
  }: {
    catalog: readonly {
      athletePublicId: string;
      slug: string;
      displayName: string;
      thumbnailUrl: string;
    }[];
    demoEntries?: readonly unknown[];
    packageId: string;
  }) => (
    <div
      data-demo-entry-count={String(demoEntries?.length ?? 0)}
      data-package-id={packageId}
      data-testid="gallery-client"
      ref={() => {
        galleryClientMock({ catalog, demoEntries, packageId });
      }}
    >
      {catalog.length} athletes
    </div>
  ),
}));

import GalleryPage from "./page";

const CATALOG = [
  {
    athletePublicId: "1",
    slug: "demo-athlete-one",
    displayName: "Demo Athlete One",
    thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+1",
  },
  {
    athletePublicId: "2",
    slug: "demo-athlete-two",
    displayName: "Demo Athlete Two",
    thumbnailUrl: "https://placehold.co/512x512/png?text=Athlete+2",
  },
] as const;

afterEach(() => {
  getAthleteCatalogMock.mockReset();
  getDemoGalleryEntriesMock.mockReset();
  isDemoModeEnabledMock.mockReset();
  loadPublicEnvMock.mockReset();
  galleryClientMock.mockReset();
});

describe("GalleryPage", () => {
  it("preloads the athlete catalog on the server and passes it to the client shell", async () => {
    getAthleteCatalogMock.mockResolvedValue(CATALOG);
    getDemoGalleryEntriesMock.mockReturnValue([]);
    isDemoModeEnabledMock.mockReturnValue(false);
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      registryObjectId: "0xregistry",
      packageId: "0xpkg",
    });

    const ui = await GalleryPage();
    render(ui);

    expect(screen.getByText(/Participation gallery/i)).toBeTruthy();
    expect(screen.getByTestId("gallery-client").textContent).toContain(
      "2 athletes",
    );
    expect(
      screen.getByTestId("gallery-client").getAttribute("data-package-id"),
    ).toBe("0xpkg");
    expect(galleryClientMock).toHaveBeenCalledWith({
      catalog: CATALOG,
      demoEntries: undefined,
      packageId: "0xpkg",
    });
  });

  it("passes demo entries to the client shell when demo mode is enabled", async () => {
    getAthleteCatalogMock.mockResolvedValue(CATALOG);
    getDemoGalleryEntriesMock.mockReturnValue([
      {
        unitId: "0xdemo-unit",
        athletePublicId: "1",
        walrusBlobId: "demo-original",
        submissionNo: 17,
        mintedAtMs: 1800000000000,
        masterId: null,
        mosaicWalrusBlobId: null,
        placement: null,
        status: { kind: "pending" },
      },
    ]);
    isDemoModeEnabledMock.mockReturnValue(true);
    loadPublicEnvMock.mockReturnValue({
      suiNetwork: "testnet",
      registryObjectId: "0xregistry",
      packageId: "0xpkg",
    });

    const ui = await GalleryPage();
    render(ui);

    expect(
      screen
        .getByTestId("gallery-client")
        .getAttribute("data-demo-entry-count"),
    ).toBe("1");
  });
});
