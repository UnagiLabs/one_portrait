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
import RootLayout, { metadata } from "./layout";

afterEach(() => {
  usePathnameMock.mockReset();
});

describe("AppShell", () => {
  it("renders the global header on regular pages", () => {
    usePathnameMock.mockReturnValue("/");

    render(<AppShell>page body</AppShell>);

    expect(screen.getByRole("link", { name: /one portrait/i })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /gallery/i }).getAttribute("href"),
    ).toBe("/gallery");
    expect(screen.getByText("page body")).toBeTruthy();
  });

  it("hides the global header on the Enoki callback page", () => {
    usePathnameMock.mockReturnValue("/auth/enoki/callback");

    render(<AppShell>callback body</AppShell>);

    expect(screen.queryByRole("link", { name: /one portrait/i })).toBeNull();
    expect(screen.getByText("callback body")).toBeTruthy();
  });
});

describe("RootLayout", () => {
  it("uses the square brand mark for site icons", () => {
    expect(metadata.icons).toEqual({
      icon: "/icon.svg",
      shortcut: "/icon.svg",
      apple: "/site/apple-icon.png",
    });
  });

  it("mounts AppShell inside the body element", () => {
    usePathnameMock.mockReturnValue("/");

    const ui = RootLayout({
      children: <div>page body</div>,
    });
    const children = Array.isArray(ui.props.children)
      ? ui.props.children
      : [ui.props.children];
    const body = children.find(
      (child: unknown) =>
        typeof child === "object" &&
        child !== null &&
        "type" in child &&
        child.type === "body",
    );

    expect(ui.type).toBe("html");
    expect(body).toBeTruthy();
    expect(body.props.children.props.children.type).toBe(AppShell);
  });
});
