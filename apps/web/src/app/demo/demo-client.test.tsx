// @vitest-environment happy-dom

import { unitTileGrid } from "@one-portrait/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DemoClient } from "./demo-client";

const createObjectURL = vi.fn<(file: File) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();
const originalMatchMedia = window.matchMedia;

Object.defineProperty(URL, "createObjectURL", {
  configurable: true,
  value: createObjectURL,
});

Object.defineProperty(URL, "revokeObjectURL", {
  configurable: true,
  value: revokeObjectURL,
});

function selectImage(file: File): void {
  const input = screen.getByLabelText(/Choose one image/i);
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });
  fireEvent.change(input);
}

describe("DemoClient", () => {
  afterEach(() => {
    cleanup();
    window.matchMedia = originalMatchMedia;
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();
  });

  it("renders the fixed Takeru Unit shell with initial progress", () => {
    render(<DemoClient />);

    expect(
      screen.getByRole("main", { name: /Takeru Unit demo/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: /Athlete unit overview/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("complementary", { name: /Submission panel/i }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Takeru" })).toBeTruthy();
    expect(screen.getByText(/UNIT ACTIVE — HIDDEN UNTIL REVEAL/i)).toBeTruthy();
    expect(screen.getByText(/Participation wallet/i)).toBeTruthy();
    expect(screen.getByText(/1999\s*\/\s*2000/)).toBeTruthy();
    expect(screen.getByText(/1 tiles remaining/i)).toBeTruthy();
  });

  it("uses only the Takeru athlete asset in the demo shell", () => {
    render(<DemoClient />);

    const takeruImage = screen.getByRole("img", { name: /Takeru/i });
    expect(takeruImage.getAttribute("src")).toBe(
      "/demo/one-athletes/Takeru-500x345-1.png",
    );

    expect(screen.queryByText(/Yuya Wakamatsu/i)).toBeNull();
    expect(screen.queryByText(/Rodtang Jitmuangnon/i)).toBeNull();
    expect(screen.queryByText(/Ayaka Miura/i)).toBeNull();
  });

  it("does not render the old cinematic demo flow", () => {
    render(<DemoClient />);

    expect(screen.queryByText(/Reveal Arena/i)).toBeNull();
    expect(screen.queryByText(/Pick your warrior/i)).toBeNull();
    expect(screen.queryByText(/Jump to reveal/i)).toBeNull();
    expect(screen.queryByText(/Replay reveal/i)).toBeNull();
    expect(screen.queryByText(/The memory becomes/i)).toBeNull();
  });

  it("shows demo Google zkLogin and Sui wallet entries while signed out", () => {
    render(<DemoClient />);

    const googleButton = screen.getByRole("button", {
      name: /Google zkLogin/i,
    });
    const suiButton = screen.getByRole("button", {
      name: /Sui wallet/i,
    });

    expect(googleButton.className).toContain("op-btn-primary");
    expect(suiButton.className).toContain("op-btn-ghost");
    expect(screen.queryByLabelText(/Choose one image/i)).toBeNull();
  });

  it.each([
    ["Google zkLogin", /Google zkLogin/i],
    ["Sui wallet", /Sui wallet/i],
  ])("connects locally with %s and exposes image selection", (_, buttonName) => {
    render(<DemoClient />);

    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    expect(screen.getByText(/Demo wallet address confirmed/i)).toBeTruthy();
    expect(screen.getByText("0xdemo...2000")).toBeTruthy();
    expect(screen.getByLabelText(/Choose one image/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Confirm submission/i }),
    ).toBeTruthy();
  });

  it("previews a selected local image and advances demo progress", () => {
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Google zkLogin/i }));

    selectImage(new File(["demo"], "portrait.png", { type: "image/png" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(
      screen.getByAltText("Selected submission preview").getAttribute("src"),
    ).toBe("blob:demo-preview-1");
    expect(screen.getByText(/2000\s*\/\s*2000/)).toBeTruthy();
    expect(screen.queryByText(/1999\s*\/\s*2000/)).toBeNull();
  });

  it("keeps the reveal canvas hidden while awaiting the final photo", () => {
    render(<DemoClient />);

    expect(screen.getByText(/1 tiles remaining/i)).toBeTruthy();
    expect(screen.queryByTestId("demo-completion-reveal")).toBeNull();
    expect(screen.queryByTestId("demo-completion-canvas")).toBeNull();
  });

  it("starts a demo completion reveal after image selection", () => {
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Google zkLogin/i }));

    selectImage(new File(["demo"], "portrait.png", { type: "image/png" }));

    expect(screen.getByTestId("demo-completion-reveal")).toBeTruthy();
    expect(screen.getByTestId("demo-completion-canvas")).toBeTruthy();
    expect(screen.getByText(/40\s*x\s*50/i)).toBeTruthy();
    expect(screen.getByText(/2000 tiles/i)).toBeTruthy();
    expect(screen.getByText(/Final fan photo accepted/i)).toBeTruthy();
  });

  it("references the completed mosaic asset in the reveal area", () => {
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Sui wallet/i }));

    selectImage(new File(["demo"], "portrait.png", { type: "image/png" }));

    const completedMosaic = screen.getByAltText("Completed Takeru mosaic");
    expect(completedMosaic.getAttribute("src")).toBe("/demo/demo_mozaiku.png");
  });

  it("shows the selected original photo in the completed panel", () => {
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Google zkLogin/i }));

    selectImage(new File(["demo"], "portrait.png", { type: "image/png" }));

    const completedOriginal = screen.getByRole("img", {
      name: /Takeru original submission/i,
    });
    expect(completedOriginal.getAttribute("src")).toBe("blob:demo-preview-1");
  });

  it("shows the fixed demo placement highlight using unit grid math", () => {
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Google zkLogin/i }));

    selectImage(new File(["demo"], "portrait.png", { type: "image/png" }));

    expect(
      screen.getByText(/highlighted at \(37, 46\) as #2000/i),
    ).toBeTruthy();

    const highlight = screen.getByTestId("demo-placement-highlight");
    const style = highlight.getAttribute("style");
    expect(style).toContain(`left: ${(37 / unitTileGrid.cols) * 100}%`);
    expect(style).toContain(`top: ${(46 / unitTileGrid.rows) * 100}%`);
    expect(style).toContain(`width: ${100 / unitTileGrid.cols}%`);
    expect(style).toContain(`height: ${100 / unitTileGrid.rows}%`);
  });

  it("toggles the fixed placement highlight", () => {
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Sui wallet/i }));

    selectImage(new File(["demo"], "portrait.png", { type: "image/png" }));

    expect(screen.getByTestId("demo-placement-highlight")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Hide highlight/i }));

    expect(screen.queryByTestId("demo-placement-highlight")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Show highlight/i }));

    expect(screen.getByTestId("demo-placement-highlight")).toBeTruthy();
  });

  it("shows the completed reveal immediately for reduced motion", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Google zkLogin/i }));

    selectImage(new File(["demo"], "portrait.png", { type: "image/png" }));

    expect(screen.getByText(/Completed mosaic revealed/i)).toBeTruthy();
  });

  it("revokes local preview URLs on reselection and unmount", () => {
    createObjectURL
      .mockReturnValueOnce("blob:demo-preview-1")
      .mockReturnValueOnce("blob:demo-preview-2");
    const { unmount } = render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Sui wallet/i }));

    selectImage(new File(["first"], "first.png", { type: "image/png" }));
    selectImage(new File(["second"], "second.png", { type: "image/png" }));
    unmount();

    expect(revokeObjectURL).toHaveBeenNthCalledWith(1, "blob:demo-preview-1");
    expect(revokeObjectURL).toHaveBeenNthCalledWith(2, "blob:demo-preview-2");
  });

  it("keeps submission copy local and mock-only for this demo step", () => {
    render(<DemoClient />);

    expect(screen.queryByText(/upload/i)).toBeNull();
    expect(screen.queryByText(/transaction/i)).toBeNull();
    expect(screen.queryByText(/finalize/i)).toBeNull();
    expect(document.body.textContent).not.toContain("/api/finalize");
    expect(document.body.textContent).not.toMatch(/generator dispatch/i);
    expect(screen.getByText(/mock/i)).toBeTruthy();
  });
});
