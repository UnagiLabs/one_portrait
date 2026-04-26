// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DemoClient } from "./demo-client";

const createObjectURL = vi.fn<(file: File) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();

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
      screen.getByRole("region", { name: /Submission panel/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Takeru" }),
    ).toBeTruthy();
    expect(screen.getByText(/1999\s*\/\s*2000/)).toBeTruthy();
    expect(screen.getByText(/Reveal area/i)).toBeTruthy();
    expect(screen.getByText(/Awaiting final photo/i)).toBeTruthy();
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
      name: /Continue with Google zkLogin/i,
    });
    const suiButton = screen.getByRole("button", {
      name: /Connect Sui wallet/i,
    });

    expect(googleButton.className).toContain("op-btn-primary");
    expect(suiButton.className).toContain("op-btn-ghost");
    expect(screen.queryByLabelText(/Choose one image/i)).toBeNull();
  });

  it.each([
    ["Google zkLogin", /Continue with Google zkLogin/i],
    ["Sui wallet", /Connect Sui wallet/i],
  ])("connects locally with %s and exposes image selection", (_, buttonName) => {
    render(<DemoClient />);

    fireEvent.click(screen.getByRole("button", { name: buttonName }));

    expect(screen.getByText(/Demo wallet connected/i)).toBeTruthy();
    expect(screen.getByText(/0xdemo/i)).toBeTruthy();
    expect(screen.getByLabelText(/Choose one image/i)).toBeTruthy();
  });

  it("previews a selected local image and advances demo progress", () => {
    createObjectURL.mockReturnValue("blob:demo-preview-1");
    render(<DemoClient />);
    fireEvent.click(
      screen.getByRole("button", { name: /Continue with Google zkLogin/i }),
    );

    selectImage(new File(["demo"], "portrait.png", { type: "image/png" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(
      screen.getByAltText("Selected submission preview").getAttribute("src"),
    ).toBe("blob:demo-preview-1");
    expect(screen.getByText(/2000\s*\/\s*2000/)).toBeTruthy();
    expect(screen.queryByText(/1999\s*\/\s*2000/)).toBeNull();
  });

  it("revokes local preview URLs on reselection and unmount", () => {
    createObjectURL
      .mockReturnValueOnce("blob:demo-preview-1")
      .mockReturnValueOnce("blob:demo-preview-2");
    const { unmount } = render(<DemoClient />);
    fireEvent.click(screen.getByRole("button", { name: /Connect Sui wallet/i }));

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
    expect(screen.getByText(/mock/i)).toBeTruthy();
  });
});
