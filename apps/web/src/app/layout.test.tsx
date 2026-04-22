// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

vi.mock("../lib/enoki/provider", () => ({
  AppWalletProvider: ({ children }: { readonly children: React.ReactNode }) => {
    return <>{children}</>;
  },
}));

vi.mock("./global-wallet-entry", () => ({
  GlobalWalletEntry: () => <div>wallet entry</div>,
}));

import { AppShell } from "./app-shell";
import RootLayout from "./layout";

afterEach(() => {
  usePathnameMock.mockReset();
});

describe("AppShell", () => {
  it("renders the global header on regular pages", () => {
    usePathnameMock.mockReturnValue("/");

    render(<AppShell>page body</AppShell>);

    expect(
      screen.getByRole("link", { name: /one portrait/i }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /gallery/i }).getAttribute("href")).toBe(
      "/gallery",
    );
    expect(screen.getByText("page body")).toBeTruthy();
  });

  it("hides the global header on the Enoki callback page", () => {
    usePathnameMock.mockReturnValue("/auth/enoki/callback");

    render(<AppShell>callback body</AppShell>);

    expect(
      screen.queryByRole("link", { name: /one portrait/i }),
    ).toBeNull();
    expect(screen.getByText("callback body")).toBeTruthy();
  });
});

describe("RootLayout", () => {
  it("mounts AppShell inside the body element", () => {
    usePathnameMock.mockReturnValue("/");

    const ui = RootLayout({
      children: <div>page body</div>,
    });

    expect(ui.type).toBe("html");
    expect(ui.props.children.type).toBe("body");
    expect(ui.props.children.props.children.props.children.type).toBe(AppShell);
  });
});
