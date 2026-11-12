const Member = require("../api/member");

async function main() {
  const identity = {
      id: "smoke_test",
      public_id: "TEST 000000",
      identity_number: "000000",
      role_code: "TM",
      created_at: new Date().toISOString(),
    },
    changes = {
      firstName: "YouCount",
      lastName: "Production Test",
      tlcLocation: "The Liberty Church",
    },
    link = await Member._googleWalletLink(identity, changes),
    token = link.split("/").pop(),
    payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url")),
    objectId = payload?.payload?.genericObjects?.[0]?.id;
  if (!link.startsWith("https://pay.google.com/gp/v/save/"))
    throw new Error("google_wallet_save_url_invalid");
  if (!objectId || !objectId.endsWith(".youcount_smoke_test"))
    throw new Error("google_wallet_object_reference_invalid");
  if (token.length >= 1800)
    throw new Error(`google_wallet_token_too_long_${token.length}`);
  process.stdout.write(
    JSON.stringify({
      ok: true,
      tokenLength: token.length,
      objectPrepared: true,
    }),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
