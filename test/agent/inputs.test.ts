import { expect, it } from "vitest";
import { requestedNamespace } from "../../src/agent/inputs";

it("reads the namespace the chat sent with the message", () => {
  expect(requestedNamespace({ namespace: "live" })).toBe("live");
  expect(requestedNamespace({ namespace: "demo" })).toBe("demo");
});

it("ignores a missing or invalid namespace", () => {
  expect(requestedNamespace(undefined)).toBeNull();
  expect(requestedNamespace({})).toBeNull();
  expect(requestedNamespace({ namespace: "prod" })).toBeNull();
  expect(requestedNamespace("live")).toBeNull();
});
