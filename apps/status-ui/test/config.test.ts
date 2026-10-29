import { describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config/env";
import { parseConfig } from "../src/config/env";
import { resolveMode } from "../src/config/modes";

const ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const GATE = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const RPC = "http://127.0.0.1:8564";

const raw = (values: Record<string, string | undefined> = {}) => ({
  VITE_MAKHZAN_MODE: values.VITE_MAKHZAN_MODE,
  VITE_MAKHZAN_RPC_URL: values.VITE_MAKHZAN_RPC_URL,
  VITE_MAKHZAN_CHAIN_ID: values.VITE_MAKHZAN_CHAIN_ID,
  VITE_MAKHZAN_CONTRACT_ADDRESS: values.VITE_MAKHZAN_CONTRACT_ADDRESS,
  VITE_GATE_ADDRESS: values.VITE_GATE_ADDRESS,
});

const config = (values: Record<string, string | undefined> = {}): AppConfig =>
  parseConfig(raw(values));

describe("parseConfig", () => {
  it("defaults the chain id to 420420777 and reads no other variable", () => {
    const parsed = config();
    expect(parsed.chainId).toBe(420420777);
    expect(parsed.requestedMode).toBeNull();
    expect(parsed.address).toBeNull();
    expect(parsed.rpcUrl).toBeNull();
    expect(parsed.errors).toEqual([]);
  });

  it("accepts the four public variables", () => {
    const parsed = config({
      VITE_MAKHZAN_MODE: "LOCAL",
      VITE_MAKHZAN_RPC_URL: RPC,
      VITE_MAKHZAN_CHAIN_ID: "31337",
      VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS,
    });
    expect(parsed.requestedMode).toBe("LOCAL");
    expect(parsed.rpcUrl).toBe(RPC);
    expect(parsed.chainId).toBe(31337);
    expect(parsed.address).toBe(ADDRESS);
    expect(parsed.errors).toEqual([]);
  });

  it("rejects an unknown mode value instead of falling back silently", () => {
    const parsed = config({ VITE_MAKHZAN_MODE: "live" });
    expect(parsed.requestedMode).toBeNull();
    expect(parsed.errors[0]?.field).toBe("VITE_MAKHZAN_MODE");
    expect(parsed.errors[0]?.message).toContain("live");
  });

  it("rejects a malformed contract address", () => {
    const parsed = config({ VITE_MAKHZAN_CONTRACT_ADDRESS: "0x1234" });
    expect(parsed.address).toBeNull();
    expect(parsed.errors[0]?.field).toBe("VITE_MAKHZAN_CONTRACT_ADDRESS");
  });

  it("rejects a non-http RPC URL", () => {
    const parsed = config({ VITE_MAKHZAN_RPC_URL: "ws://127.0.0.1:8564" });
    expect(parsed.rpcUrl).toBeNull();
    expect(parsed.errors[0]?.field).toBe("VITE_MAKHZAN_RPC_URL");
  });

  it("rejects a chain id that is not a positive safe integer", () => {
    for (const value of ["0", "-1", "1.5", "not-a-number"]) {
      const parsed = config({ VITE_MAKHZAN_CHAIN_ID: value });
      expect(parsed.errors[0]?.field).toBe("VITE_MAKHZAN_CHAIN_ID");
      expect(parsed.chainId).toBe(420420777);
    }
  });

  it("treats empty strings as unset", () => {
    const parsed = config({
      VITE_MAKHZAN_MODE: "",
      VITE_MAKHZAN_RPC_URL: "",
      VITE_MAKHZAN_CHAIN_ID: "",
      VITE_MAKHZAN_CONTRACT_ADDRESS: "",
      VITE_GATE_ADDRESS: "",
    });
    expect(parsed).toMatchObject({
      requestedMode: null,
      rpcUrl: null,
      address: null,
      gateAddress: null,
      chainId: 420420777,
      errors: [],
    });
  });
});

describe("the gate address", () => {
  it("is null when VITE_GATE_ADDRESS is unset, and invents no address", () => {
    const parsed = config();
    expect(parsed.gateAddress).toBeNull();
    expect(parsed.gateAddressError).toBeNull();
  });

  it("accepts an address that is 0x and forty hex characters", () => {
    const parsed = config({ VITE_GATE_ADDRESS: GATE });
    expect(parsed.gateAddress).toBe(GATE);
    expect(parsed.gateAddressError).toBeNull();
  });

  it("treats a whitespace-only value as unset", () => {
    const parsed = config({ VITE_GATE_ADDRESS: "   " });
    expect(parsed.gateAddress).toBeNull();
    expect(parsed.gateAddressError).toBeNull();
  });

  it("records a malformed value without taking the rest of the app down", () => {
    const parsed = config({
      VITE_MAKHZAN_MODE: "LIVE",
      VITE_MAKHZAN_RPC_URL: RPC,
      VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS,
      VITE_GATE_ADDRESS: "0x1234",
    });
    expect(parsed.gateAddress).toBeNull();
    expect(parsed.gateAddressError).toMatch(/VITE_GATE_ADDRESS/);
    expect(parsed.errors).toEqual([]);
    expect(resolveMode(parsed).clientEnabled).toBe(true);
  });

  it("carries the address and its error into the mode state", () => {
    expect(resolveMode(config({ VITE_GATE_ADDRESS: GATE })).gateAddress).toBe(GATE);
    expect(resolveMode(config()).gateAddress).toBeNull();
    expect(resolveMode(config({ VITE_GATE_ADDRESS: "0xzz" })).gateAddressError).toMatch(/VITE_GATE_ADDRESS/);
  });
});

describe("resolveMode", () => {
  it("is RECORDED with no variables and creates no client", () => {
    const state = resolveMode(config());
    expect(state.mode).toBe("RECORDED");
    expect(state.clientEnabled).toBe(false);
    expect(state.blocking).toBeNull();
  });

  it("is LIVE when an address and an RPC URL are set and no mode is requested", () => {
    const state = resolveMode(config({ VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS, VITE_MAKHZAN_RPC_URL: RPC }));
    expect(state.mode).toBe("LIVE");
    expect(state.clientEnabled).toBe(true);
    expect(state.address).toBe(ADDRESS);
  });

  it("keeps RECORDED without a client even when an address is configured", () => {
    const state = resolveMode(
      config({ VITE_MAKHZAN_MODE: "RECORDED", VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS, VITE_MAKHZAN_RPC_URL: RPC }),
    );
    expect(state.mode).toBe("RECORDED");
    expect(state.clientEnabled).toBe(false);
    expect(state.blocking).toBeNull();
  });

  it("honours an explicit LOCAL mode", () => {
    const state = resolveMode(
      config({ VITE_MAKHZAN_MODE: "LOCAL", VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS, VITE_MAKHZAN_RPC_URL: RPC }),
    );
    expect(state.mode).toBe("LOCAL");
    expect(state.clientEnabled).toBe(true);
  });

  it("blocks a LIVE request without an address and keeps the recorded layer", () => {
    const state = resolveMode(config({ VITE_MAKHZAN_MODE: "LIVE", VITE_MAKHZAN_RPC_URL: RPC }));
    expect(state.mode).toBe("RECORDED");
    expect(state.clientEnabled).toBe(false);
    expect(state.blocking?.kind).toBe("config");
    expect(state.blocking?.detail).toContain("address");
  });

  it("blocks a LIVE request without an RPC URL", () => {
    const state = resolveMode(config({ VITE_MAKHZAN_MODE: "LIVE", VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS }));
    expect(state.mode).toBe("RECORDED");
    expect(state.clientEnabled).toBe(false);
    expect(state.blocking?.kind).toBe("config");
    expect(state.blocking?.detail.toLowerCase()).toContain("rpc");
  });

  it("blocks an invalid mode value and stays RECORDED", () => {
    const state = resolveMode(config({ VITE_MAKHZAN_MODE: "LIVEISH", VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS, VITE_MAKHZAN_RPC_URL: RPC }));
    expect(state.mode).toBe("RECORDED");
    expect(state.blocking?.kind).toBe("config");
  });

  it("does not infer LOCAL from a loopback URL", () => {
    const state = resolveMode(config({ VITE_MAKHZAN_CONTRACT_ADDRESS: ADDRESS, VITE_MAKHZAN_RPC_URL: RPC }));
    expect(state.mode).toBe("LIVE");
  });

  it("shows the expected chain id even when recorded", () => {
    const state = resolveMode(config({ VITE_MAKHZAN_CHAIN_ID: "31337" }));
    expect(state.expectedChainId).toBe(31337);
    expect(state.mode).toBe("RECORDED");
  });
});
