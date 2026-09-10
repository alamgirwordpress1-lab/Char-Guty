import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseCallbackQuery, verifySignature } from "./verifySignature.js";
import type { VerifierKey } from "./verifySignature.js";

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const KEY_ID = 42;
const keys: VerifierKey[] = [{ keyId: KEY_ID, pem: publicKey }];

function sign(content: string): string {
  const signer = createSign("SHA256");
  signer.update(content);
  signer.end();
  return signer.sign(privateKey).toString("base64url");
}

function buildQuery(content: string, keyId = KEY_ID, signature?: string): string {
  const sig = signature ?? sign(content);
  return `${content}&signature=${sig}&key_id=${keyId}`;
}

describe("parseCallbackQuery", () => {
  it("extracts the exact bytes signed, excluding signature/key_id", () => {
    const content = "ad_network=1&transaction_id=abc&user_id=u1";
    const parsed = parseCallbackQuery(buildQuery(content));
    expect(parsed?.signedContent).toBe(content);
    expect(parsed?.keyId).toBe(KEY_ID);
  });

  it("returns null when signature or key_id is missing", () => {
    expect(parseCallbackQuery("ad_network=1&transaction_id=abc")).toBeNull();
  });
});

describe("verifySignature", () => {
  it("accepts a correctly signed callback", () => {
    const content = "ad_network=1&transaction_id=abc&user_id=u1";
    const parsed = parseCallbackQuery(buildQuery(content));
    expect(parsed).not.toBeNull();
    expect(verifySignature(parsed!, keys)).toBe(true);
  });

  it("rejects a callback whose content was tampered with after signing", () => {
    const signed = sign("ad_network=1&transaction_id=abc&user_id=u1");
    const tampered = parseCallbackQuery(
      buildQuery("ad_network=1&transaction_id=abc&user_id=u2", KEY_ID, signed),
    );
    expect(verifySignature(tampered!, keys)).toBe(false);
  });

  it("rejects an unknown key_id", () => {
    const content = "ad_network=1&transaction_id=abc&user_id=u1";
    const parsed = parseCallbackQuery(buildQuery(content, 999));
    expect(verifySignature(parsed!, keys)).toBe(false);
  });

  it("rejects a garbage signature", () => {
    const content = "ad_network=1&transaction_id=abc&user_id=u1";
    const parsed = parseCallbackQuery(buildQuery(content, KEY_ID, "not-a-real-signature"));
    expect(verifySignature(parsed!, keys)).toBe(false);
  });
});
