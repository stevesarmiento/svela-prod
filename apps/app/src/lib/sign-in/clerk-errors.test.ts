import { describe, expect, test } from "bun:test";
import {
  isAccountAlreadyExistsError,
  isAccountNotFoundError,
  resolveClerkErrorMessage,
} from "./clerk-errors";

describe("clerk error helpers", () => {
  test("detects account not found from Clerk structured errors", () => {
    const error = {
      errors: [{ code: "web3_wallet_not_found", message: "Wallet not found" }],
    };

    expect(isAccountNotFoundError(error)).toBe(true);
  });

  test("detects account already exists from Clerk structured errors", () => {
    const error = {
      errors: [{ code: "web3_wallet_exists", message: "Wallet already exists" }],
    };

    expect(isAccountAlreadyExistsError(error)).toBe(true);
  });

  test("normalizes generic fallback errors", () => {
    const error = {
      errors: [{ message: "Something went wrong." }],
    };

    expect(resolveClerkErrorMessage(error)).toBe("Something went wrong.");
  });
});
