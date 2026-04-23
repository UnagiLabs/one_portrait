import { describe, expect, it } from "vitest";

import {
  createSuiClient,
  resolveFullnodeUrl,
  type SuiReadClient,
} from "./client";

describe("resolveFullnodeUrl", () => {
  it("returns the official testnet URL for testnet", () => {
    expect(resolveFullnodeUrl("testnet")).toBe(
      "https://fullnode.testnet.sui.io:443",
    );
  });

  it("returns the official mainnet URL for mainnet", () => {
    expect(resolveFullnodeUrl("mainnet")).toBe(
      "https://fullnode.mainnet.sui.io:443",
    );
  });

  it("returns the official devnet URL for devnet", () => {
    expect(resolveFullnodeUrl("devnet")).toBe(
      "https://fullnode.devnet.sui.io:443",
    );
  });

  it("returns the loopback URL for localnet", () => {
    expect(resolveFullnodeUrl("localnet")).toBe("http://127.0.0.1:9000");
  });
});

describe("createSuiClient", () => {
  it("returns a client whose network matches the requested network", () => {
    const client = createSuiClient({ network: "testnet" });

    expect(client.network).toBe("testnet");
  });

  it("returns a client typed as SuiReadClient", () => {
    const client: SuiReadClient = createSuiClient({ network: "mainnet" });

    expect(typeof client.getDynamicFields).toBe("function");
    expect(typeof client.getObject).toBe("function");
    expect(typeof client.getDynamicFieldObject).toBe("function");
  });
});
