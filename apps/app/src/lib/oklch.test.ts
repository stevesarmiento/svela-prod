import { describe, expect, test } from "bun:test";
import {
  multiplyAlpha,
  oklchToRgb,
  oklchToRgbString,
  parseOklch,
  srgbToOklchString,
  withAlpha,
} from "@v1/ui/oklch";

describe("parseOklch", () => {
  test("parses bare and slash-alpha forms", () => {
    expect(parseOklch("oklch(0.628 0.2577 29.23)")).toEqual({
      l: 0.628,
      c: 0.2577,
      h: 29.23,
      alpha: 1,
    });
    expect(parseOklch("oklch(62.8% 0.2577 29.23 / 0.5)")).toEqual({
      l: 0.628,
      c: 0.2577,
      h: 29.23,
      alpha: 0.5,
    });
  });

  test("returns null for non-oklch strings", () => {
    expect(parseOklch("#ff0000")).toBeNull();
    expect(parseOklch("rgba(0,0,0,0.5)")).toBeNull();
    expect(parseOklch("hsl(var(--primary))")).toBeNull();
    expect(parseOklch("transparent")).toBeNull();
  });
});

describe("oklchToRgb anchors", () => {
  test("white", () => {
    expect(oklchToRgb({ l: 1, c: 0, h: 0, alpha: 1 })).toEqual([255, 255, 255]);
  });
  test("black", () => {
    expect(oklchToRgb({ l: 0, c: 0, h: 0, alpha: 1 })).toEqual([0, 0, 0]);
  });
  test("pure red", () => {
    expect(oklchToRgb({ l: 0.6279, c: 0.2577, h: 29.23, alpha: 1 })).toEqual([255, 0, 0]);
  });
});

describe("srgbToOklchString round-trips every emitted value", () => {
  const cases: Array<[number, number, number]> = [
    [255, 255, 255],
    [0, 0, 0],
    [255, 0, 0],
    [229, 231, 235], // #e5e7eb
    [135, 135, 135], // #878787
    [47, 44, 48], // shadow recipe gray
    [153, 69, 255], // solana purple
  ];
  for (const [r, g, b] of cases) {
    test(`rgb(${r}, ${g}, ${b})`, () => {
      const s = srgbToOklchString(r, g, b);
      const parsed = parseOklch(s);
      expect(parsed).not.toBeNull();
      expect(oklchToRgb(parsed as NonNullable<typeof parsed>)).toEqual([r, g, b]);
    });
  }

  test("achromatic pins hue to 0", () => {
    expect(srgbToOklchString(128, 128, 128)).toMatch(/oklch\([\d.]+ 0 0\)/);
  });

  test("alpha passes through with slash syntax", () => {
    expect(srgbToOklchString(255, 255, 255, 0.5)).toBe("oklch(1 0 0 / 0.5)");
  });
});

describe("string surgery helpers", () => {
  test("withAlpha sets/replaces alpha without conversion", () => {
    expect(withAlpha("oklch(0.5 0.1 200)", 0.3)).toBe("oklch(0.5 0.1 200 / 0.3)");
    expect(withAlpha("oklch(0.5 0.1 200 / 0.9)", 0.3)).toBe("oklch(0.5 0.1 200 / 0.3)");
    // Non-oklch input is returned unchanged (defensive).
    expect(withAlpha("#fff", 0.3)).toBe("#fff");
  });

  test("multiplyAlpha scales existing alpha", () => {
    expect(multiplyAlpha("oklch(0.5 0.1 200 / 0.5)", 0.5)).toBe("oklch(0.5 0.1 200 / 0.25)");
  });

  test("oklchToRgbString bridges for canvas libs", () => {
    expect(oklchToRgbString("oklch(1 0 0)")).toBe("rgb(255, 255, 255)");
    expect(oklchToRgbString("oklch(1 0 0 / 0.5)")).toBe("rgba(255, 255, 255, 0.5)");
    expect(oklchToRgbString("not-a-color")).toBe("not-a-color");
  });
});
