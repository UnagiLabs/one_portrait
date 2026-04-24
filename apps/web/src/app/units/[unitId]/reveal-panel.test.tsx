// @vitest-environment happy-dom

import { unitTileGrid } from "@one-portrait/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RevealPanel } from "./reveal-panel";

describe("RevealPanel", () => {
  it("shows the original photo and the red tile frame by default", () => {
    render(
      <RevealPanel
        displayName="Demo Athlete One"
        mosaicUrl="https://example.com/mosaic.png"
        originalPhotoUrl="https://example.com/original.png"
        placement={{ x: 12, y: 34, submitter: "0xviewer", submissionNo: 42 }}
      />,
    );

    expect(
      screen.getByRole("img", { name: /Demo Athlete One completed mosaic/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: /Demo Athlete One original submission/i,
      }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("placement-highlight").getAttribute("style"),
    ).toContain(`left: ${(12 / unitTileGrid.cols) * 100}%`);
    expect(
      screen.getByTestId("placement-highlight").getAttribute("style"),
    ).toContain(`top: ${(34 / unitTileGrid.rows) * 100}%`);
    expect(
      screen.getByTestId("placement-highlight").getAttribute("style"),
    ).toContain(`width: ${100 / unitTileGrid.cols}%`);
    expect(
      screen.getByTestId("placement-highlight").getAttribute("style"),
    ).toContain(`height: ${100 / unitTileGrid.rows}%`);
  });

  it("toggles the highlight visibility", () => {
    render(
      <RevealPanel
        displayName="Demo Athlete One"
        mosaicUrl="https://example.com/mosaic.png"
        originalPhotoUrl="https://example.com/original.png"
        placement={{ x: 12, y: 34, submitter: "0xviewer", submissionNo: 42 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /hide highlight/i }));
    expect(screen.queryByTestId("placement-highlight")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /show highlight/i }));
    expect(screen.getByTestId("placement-highlight")).toBeTruthy();
  });

  it("keeps the fallback copy when the original photo is unavailable", () => {
    render(
      <RevealPanel
        displayName="Demo Athlete One"
        mosaicUrl="https://example.com/mosaic.png"
        originalPhotoUrl={null}
        placement={{ x: 12, y: 34, submitter: "0xviewer", submissionNo: 42 }}
      />,
    );

    expect(screen.getByText(/Original photo unavailable/i)).toBeTruthy();
    expect(
      screen.getByText(/Your Kakera is highlighted at \(12, 34\) as #42\./i),
    ).toBeTruthy();
  });
});
