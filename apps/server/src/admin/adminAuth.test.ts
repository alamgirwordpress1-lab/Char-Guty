import { afterEach, describe, expect, it } from "vitest";
import { adminToken, isAdminToken } from "./adminAuth.js";

const configured = process.env.ADMIN_TOKEN;

afterEach(() => {
  if (configured === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = configured;
});

describe("adminToken", () => {
  it("ignores stray whitespace around the configured value", () => {
    process.env.ADMIN_TOKEN = "  s3cret-token\n";
    expect(adminToken()).toBe("s3cret-token");
  });

  it("counts a missing or blank value as not configured", () => {
    process.env.ADMIN_TOKEN = "   ";
    expect(adminToken()).toBeUndefined();
    delete process.env.ADMIN_TOKEN;
    expect(adminToken()).toBeUndefined();
  });
});

describe("isAdminToken", () => {
  it("accepts only the exact token", () => {
    expect(isAdminToken("s3cret-token", "s3cret-token")).toBe(true);
    expect(isAdminToken("s3cret-token", "s3cret-tokeN")).toBe(false);
    expect(isAdminToken("s3cret-token", "s3cret")).toBe(false);
    expect(isAdminToken("s3cret-token", undefined)).toBe(false);
  });
});
