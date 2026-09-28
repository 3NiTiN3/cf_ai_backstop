import { expect, it } from "vitest";
import {
  GENERIC_MESSAGE,
  QUOTA_MESSAGE,
  chatErrorMessage,
} from "../../src/agent/errors";

it("explains when the Workers AI daily allowance is used up", () => {
  const error = new Error(
    "4006: you have used up your daily free allocation of 10,000 neurons",
  );
  expect(chatErrorMessage(error)).toBe(QUOTA_MESSAGE);
});

it("hides other error details from the client", () => {
  expect(chatErrorMessage(new Error("internal detail token=abc"))).toBe(
    GENERIC_MESSAGE,
  );
  expect(chatErrorMessage("boom")).toBe(GENERIC_MESSAGE);
});
