import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ERROR_MESSAGES, mapContractError } from "../src/errors.ts";

const DOCUMENTED: [string, string][] = [
  ["NotRegistered", "caller is not a registered provider"],
  ["AlreadyRegistered", "address already has a provider id"],
  ["BondTooSmall", "value is below the minimum bond"],
  ["HasOpenDeal", "provider still has an unsettled deal"],
  ["NoDeal", "no deal with that id"],
  ["NotOwner", "caller is not the deal owner"],
  ["NotProvider", "caller is not the deal's provider"],
  ["BadParams", "a creation or input rule failed"],
  ["DealExpired", "the deal's end block has passed"],
  ["ChallengeOpen", "a challenge is already open on this deal"],
  ["NoChallenge", "no open challenge on this deal"],
  ["ProofRejected", "bytes or path failed verification, or the length is wrong"],
  ["WindowOpen", "the response window has not closed yet, or an answer arrived after its deadline"],
  ["ZeroClaim", "nothing has accrued since the last claim"],
  ["AlreadySettled", "the deal is already settled"],
  ["BeforeEnd", "settlement attempted before the end block"],
  ["TransferFailed", "a value transfer reverted"],
];

test("all 17 custom errors map to their documented message", () => {
  assert.equal(DOCUMENTED.length, 17);
  for (const [name, message] of DOCUMENTED) {
    assert.equal(ERROR_MESSAGES[name], message, `${name} message`);
  }
  assert.equal(Object.keys(ERROR_MESSAGES).length, 17, "no undocumented error in the map");
});

test("a revert string in either shape resolves to the documented message", () => {
  for (const [name, message] of DOCUMENTED) {
    assert.equal(mapContractError(`execution reverted: Makhzan: ${name}`), message, name);
    assert.equal(mapContractError(`${name}()`), message, name);
    assert.equal(mapContractError(new Error(`execution reverted: ${name}`)), message, name);
  }
});

test("WindowOpen says it covers both directions of the window", () => {
  const message = mapContractError("WindowOpen()");
  assert.match(message, /not closed yet/);
  assert.match(message, /after its deadline/);
});

test("an unknown error string is surfaced verbatim, never swallowed", () => {
  assert.equal(mapContractError("execution reverted: SomeNewError(42)"), "execution reverted: SomeNewError(42)");
  assert.equal(mapContractError(new Error("boom")), "boom");
  assert.equal(mapContractError("plain string"), "plain string");
});
