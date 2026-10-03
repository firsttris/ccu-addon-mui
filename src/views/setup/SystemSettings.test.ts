import { describe, expect, it } from "vitest";
import { formatOffset, parseCoordinate } from "./SystemSettings";

describe("SystemSettings", () => {
  it("formats the time zone offset", () => {
    expect(formatOffset(60)).toBe("UTC+1");
    expect(formatOffset(0)).toBe("UTC+0");
    expect(formatOffset(-210)).toBe("UTC−3:30");
    expect(formatOffset(345)).toBe("UTC+5:45");
  });

  it("reads coordinates with a decimal comma and checks the range", () => {
    expect(parseCoordinate("48,137", 90)).toBe(48.137);
    expect(parseCoordinate(" -11.5 ", 180)).toBe(-11.5);
    expect(parseCoordinate("91", 90)).toBeNull();
    expect(parseCoordinate("", 90)).toBeNull();
    expect(parseCoordinate("abc", 90)).toBeNull();
  });
});
