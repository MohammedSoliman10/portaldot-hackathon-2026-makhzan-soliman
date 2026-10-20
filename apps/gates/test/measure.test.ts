import { test } from "node:test";
import assert from "node:assert/strict";
import { makeMeasurement, differentialMeasurement, MeasurementError } from "../src/lib/measure.ts";

test("method is always recorded", () => {
  const measurement = makeMeasurement({
    name: "deploy-gas",
    value: 100,
    unit: "gas",
    method: "estimate",
    conditions: { compiler: "solc-0.8.28" },
  });
  assert.equal(measurement.method, "estimate");
});

test("a missing method throws", () => {
  assert.throws(
    () =>
      makeMeasurement({
        name: "deploy-gas",
        value: 100,
        unit: "gas",
        method: undefined as never,
        conditions: {},
      }),
    MeasurementError,
  );
});

test("receipt method requires a txRef", () => {
  assert.throws(
    () => makeMeasurement({ name: "set-gas", value: 100, unit: "gas", method: "receipt", conditions: {} }),
    MeasurementError,
  );
});

test("differential requires two labelled samples", () => {
  assert.throws(
    () =>
      makeMeasurement({
        name: "slot-gas",
        value: 100,
        unit: "gas",
        method: "differential",
        conditions: {},
        samples: [{ label: "empty", value: 100 }],
      }),
    MeasurementError,
  );
});

test("differential records both labels", () => {
  const measurement = differentialMeasurement({
    name: "slot-gas",
    unit: "gas",
    conditions: { contract: "StorageProbe" },
    a: { label: "one-slot", value: 22100 },
    b: { label: "two-slots", value: 42100 },
  });
  assert.equal(measurement.value, 20000);
  assert.deepEqual(measurement.conditions.samples, "one-slot=22100;two-slots=42100");
});
