// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../home-experience", () => ({
  MosaicConvergence: ({
    loadingText = "Loading assets",
    onComplete,
  }: {
    readonly loadingText?: string;
    readonly onComplete?: () => void;
  }) => (
    <>
      <canvas data-testid="demo-reveal-canvas" />
      <div>{loadingText}</div>
      <button onClick={onComplete} type="button">
        Finish reveal animation
      </button>
    </>
  ),
}));

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

function mockReducedMotion(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: matches && query === "(prefers-reduced-motion: reduce)",
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }));
}

function submitDemoImage(): void {
  selectImage(new File(["demo"], "portrait.png", { type: "image/png" }));
  fireEvent.click(screen.getByRole("button", { name: /Confirm submission/i }));
}

describe("DemoClient", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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

  it("previews a selected local image without advancing demo progress", () => {
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Google zkLogin/i }));

    selectImage(new File(["demo"], "portrait.png", { type: "image/png" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(
      screen.getByAltText("Selected submission preview").getAttribute("src"),
    ).toBe("blob:demo-preview-1");
    expect(screen.getByText(/1999\s*\/\s*2000/)).toBeTruthy();
    expect(screen.queryByText(/2000\s*\/\s*2000/)).toBeNull();
    expect(screen.queryByTestId("demo-completion-reveal")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: /Confirm submission/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("keeps the reveal canvas hidden while awaiting the final photo", () => {
    render(<DemoClient />);

    expect(screen.getByText(/1 tiles remaining/i)).toBeTruthy();
    expect(screen.queryByTestId("demo-completion-reveal")).toBeNull();
    expect(screen.queryByTestId("demo-completion-canvas")).toBeNull();
  });

  it("shows a full-screen demo reveal overlay after submission confirmation", () => {
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Google zkLogin/i }));

    submitDemoImage();

    expect(screen.getByTestId("demo-reveal-overlay")).toBeTruthy();
    expect(screen.getByTestId("demo-reveal-canvas")).toBeTruthy();
    expect(screen.getByText(/Loading assets/i)).toBeTruthy();
    expect(screen.getByText(/2000\s*\/\s*2000/)).toBeTruthy();
    expect(screen.queryByTestId("reveal-panel")).toBeNull();
  });

  it("holds the completed reveal briefly before easing into the completed panel", () => {
    vi.useFakeTimers();
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Google zkLogin/i }));

    submitDemoImage();

    const overlay = screen.getByTestId("demo-reveal-overlay");
    expect(overlay.getAttribute("data-state")).toBe("revealing");

    fireEvent.click(
      screen.getByRole("button", { name: /Finish reveal animation/i }),
    );

    expect(screen.getByTestId("demo-reveal-overlay")).toBeTruthy();
    expect(
      screen.getByTestId("demo-reveal-overlay").getAttribute("data-state"),
    ).toBe("hold");
    expect(screen.queryByTestId("demo-reveal-handoff")).toBeNull();
    expect(screen.queryByTestId("demo-completion-reveal")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(999);
    });

    expect(
      screen.getByTestId("demo-reveal-overlay").getAttribute("data-state"),
    ).toBe("hold");
    expect(screen.queryByTestId("demo-completion-reveal")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(
      screen.getByTestId("demo-reveal-overlay").getAttribute("data-state"),
    ).toBe("handoff");
    expect(screen.getByTestId("demo-reveal-handoff")).toBeTruthy();
    expect(screen.getByTestId("demo-completion-reveal")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1599);
    });

    expect(screen.getByTestId("demo-reveal-overlay")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByTestId("demo-reveal-overlay")).toBeNull();
    expect(screen.getByTestId("demo-completion-reveal")).toBeTruthy();
  });

  it("references the completed mosaic asset in the reveal area", () => {
    mockReducedMotion(true);
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Sui wallet/i }));

    submitDemoImage();

    const completedMosaic = screen.getByAltText("Takeru completed mosaic");
    expect(completedMosaic.getAttribute("src")).toBe("/demo/demo_mozaiku.png");
  });

  it("shows the selected original photo in the completed panel", () => {
    mockReducedMotion(true);
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Google zkLogin/i }));

    submitDemoImage();

    const completedOriginal = screen.getByRole("img", {
      name: /Takeru original submission/i,
    });
    expect(completedOriginal.getAttribute("src")).toBe("blob:demo-preview-1");
  });

  it("shows the fixed demo placement highlight using unit grid math", () => {
    mockReducedMotion(true);
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Google zkLogin/i }));

    submitDemoImage();

    expect(
      screen.getByText(/highlighted at \(37, 46\) as #2000/i),
    ).toBeTruthy();

    const highlight = screen.getByTestId("placement-highlight");
    const style = highlight.getAttribute("style");
    expect(style).toContain("left:");
    expect(style).toContain("top:");
    expect(style).toContain("width:");
    expect(style).toContain("height:");
  });

  it("toggles the fixed placement highlight", () => {
    mockReducedMotion(true);
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Sui wallet/i }));

    submitDemoImage();

    expect(screen.getByTestId("placement-highlight")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Hide highlight/i }));

    expect(screen.queryByTestId("placement-highlight")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Show highlight/i }));

    expect(screen.getByTestId("placement-highlight")).toBeTruthy();
  });

  it("shows the completed reveal immediately for reduced motion", () => {
    mockReducedMotion(true);
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Google zkLogin/i }));

    submitDemoImage();

    expect(screen.getByTestId("reveal-panel")).toBeTruthy();
    expect(screen.queryByTestId("demo-reveal-overlay")).toBeNull();
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
