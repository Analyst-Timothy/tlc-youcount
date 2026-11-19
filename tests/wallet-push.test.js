const test = require("node:test");
const assert = require("node:assert/strict");
const forge = require("node-forge");
const { applePushCredentials } = require("../api/_wallet");

test("Apple push credentials are extracted from the pass PKCS12 bundle as PEM", () => {
  const keys = forge.pki.rsa.generateKeyPair(512),
    certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date(Date.now() - 60_000);
  certificate.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attributes = [
    { name: "commonName", value: "YouCount test pass" },
    { name: "organizationalUnitName", value: "TESTTEAM01" },
  ];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const password = "test-password",
    p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, certificate, password, {
      algorithm: "3des",
    }),
    encoded = forge.util.encode64(forge.asn1.toDer(p12).getBytes()),
    credentials = applePushCredentials(encoded, password, "TESTTEAM01");
  assert.match(credentials.cert, /BEGIN CERTIFICATE/);
  assert.match(credentials.key, /BEGIN RSA PRIVATE KEY/);
});
