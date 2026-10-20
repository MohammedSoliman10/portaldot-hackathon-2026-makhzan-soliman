import { test } from "node:test";
import assert from "node:assert/strict";
import { deployPathOrder } from "../src/lib/deploy.ts";

test("EVM is attempted first when allowEVMBytecode is true", () => {
  assert.deepEqual(deployPathOrder("evm"), ["evm", "pvm"]);
});

test("PVM is attempted first when the caller asks for it", () => {
  assert.deepEqual(deployPathOrder("pvm"), ["pvm", "evm"]);
});
