// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DemoClient } from "./demo-client";

describe("DemoClient", () => {
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
});
