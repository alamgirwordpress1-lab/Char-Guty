/**
 * Makes the upload keystore Google Play signs releases with, without needing a JDK:
 * `pnpm -F @char-guty/game exec tsx scripts/make-upload-keystore.ts`
 *
 * It asks for a password (typed here, never stored in the repo), writes upload.p12 and the
 * same file as base64 text next to it, and prints what to paste into the repository's
 * Actions secrets. Keep both files and the password safe: lose them and the app can never
 * be updated under com.charguty.game again. Never commit either file.
 */
import { createInterface } from "node:readline";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import forge from "node-forge";

const ALIAS = "charguty";
const YEARS = 40;
const outDir = process.argv[2] ?? join(homedir(), "Desktop", "char-guty-keystore");

/**
 * The password, asked for twice. At a console it is typed blind, so it never shows on
 * screen; piped in (for a test run) the two lines are read as they come.
 */
async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const piped = await new Promise<string>((resolve) => {
      let text = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => (text += chunk));
      process.stdin.on("end", () => resolve(text));
    });
    const [first = "", second = first] = piped.split(/\r?\n/).map((line) => line.trim());
    if (second !== first) throw new Error("The two passwords are different - run it again.");
    return first;
  }

  // One console for both questions, its output muted while each answer is typed.
  let muted = false;
  const output = Object.assign(Object.create(process.stdout) as NodeJS.WritableStream, {
    write(chunk: string): boolean {
      if (!muted) process.stdout.write(chunk);
      return true;
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const ask = (question: string): Promise<string> => {
    process.stdout.write(question);
    muted = true;
    return new Promise((resolve) => {
      rl.question("", (answer) => {
        muted = false;
        process.stdout.write("\n");
        resolve(answer.trim());
      });
    });
  };
  try {
    const first = await ask("Choose a keystore password (write it down somewhere safe): ");
    const second = await ask("Type the same password again: ");
    if (second !== first) throw new Error("The two passwords are different - run it again.");
    return first;
  } finally {
    rl.close();
  }
}

const password = await readPassword();
if (password.length < 6) throw new Error("Play wants at least 6 characters - run it again.");

console.log("Making a 2048-bit key, this takes a few seconds...");
const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = `00${forge.util.bytesToHex(forge.random.getBytesSync(8))}`;
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + YEARS);
// The name on the key; stores show none of it, but a certificate must carry one.
const name = [
  { name: "commonName", value: "Char Guty" },
  { name: "organizationName", value: "Char Guty" },
  { name: "countryName", value: "BD" },
];
cert.setSubject(name);
cert.setIssuer(name);
cert.sign(keys.privateKey, forge.md.sha256.create());

const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
  friendlyName: ALIAS,
  algorithm: "3des",
  generateLocalKeyId: true,
});
const der = forge.asn1.toDer(p12).getBytes();
const bytes = Buffer.from(der, "binary");

mkdirSync(outDir, { recursive: true });
const keystorePath = join(outDir, "upload.p12");
const base64Path = join(outDir, "upload.p12.base64.txt");
writeFileSync(keystorePath, bytes);
writeFileSync(base64Path, bytes.toString("base64"));

// Read it back the way the build will, so a broken file is caught here and not in CI.
const keyBagType = forge.pki.oids.pkcs8ShroudedKeyBag ?? "";
const certBagType = forge.pki.oids.certBag ?? "";
const check = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), password);
const keyBags = check.getBags({ bagType: keyBagType })[keyBagType];
const certBags = check.getBags({ bagType: certBagType })[certBagType];
if (!keyBags?.length || !certBags?.length) throw new Error("the keystore came out empty");

console.log(`\nDone. Key alias: ${ALIAS}, valid for ${YEARS} years.`);
console.log(`  keystore : ${keystorePath}`);
console.log(`  base64   : ${base64Path}`);
console.log(`
Now add three repository secrets (GitHub -> Settings -> Secrets and variables -> Actions):
  ANDROID_KEYSTORE_BASE64   = the whole contents of ${base64Path}
  ANDROID_KEYSTORE_PASSWORD = the password you just typed
  ANDROID_KEY_ALIAS         = ${ALIAS}
Then the "Android release" workflow builds the signed .aab for Play.`);
