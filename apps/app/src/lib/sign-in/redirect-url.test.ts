import { describe, expect, test } from "bun:test";
import { getRedirectUrlComplete } from "./redirect-url";

describe("getRedirectUrlComplete", () => {
  test("returns a valid app-relative next path", () => {
    const params = new URLSearchParams({ next: "/overview" });
    expect(getRedirectUrlComplete(params)).toBe("/overview");
  });

  test("preserves locale paths", () => {
    const params = new URLSearchParams({ next: "/fr/watchlists" });
    expect(getRedirectUrlComplete(params)).toBe("/fr/watchlists");
  });

  test("falls back when next is missing", () => {
    expect(getRedirectUrlComplete(new URLSearchParams())).toBe("/watchlists");
  });

  test("rejects absolute urls", () => {
    const params = new URLSearchParams({ next: "https://evil.example/overview" });
    expect(getRedirectUrlComplete(params)).toBe("/watchlists");
  });

  test("rejects protocol-relative urls", () => {
    const params = new URLSearchParams({ next: "//evil.example/watchlists" });
    expect(getRedirectUrlComplete(params)).toBe("/watchlists");
  });
});
