const crypto = require("node:crypto");
const http2 = require("node:http2");
const L = require("./_lib");

const b64 = (value) => Buffer.from(value).toString("base64url");

async function applePushToken(pushToken) {
  const encoded = String(process.env.APPLE_PASS_P12_BASE64 || "").replace(/\s/g, ""),
    passphrase = String(process.env.APPLE_PASS_P12_PASSWORD || ""),
    topic = String(process.env.APPLE_PASS_TYPE_ID || "");
  if (!encoded || !topic || !pushToken) return false;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try { client.close(); } catch {}
      resolve(value);
    };
    const client = http2.connect("https://api.push.apple.com", {
      pfx: Buffer.from(encoded, "base64"),
      passphrase,
    });
    client.once("error", () => finish(false));
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${pushToken}`,
      "apns-topic": topic,
      "apns-priority": "5",
      "apns-push-type": "background",
    });
    let status = 0;
    request.on("response", (headers) => { status = Number(headers[":status"] || 0); });
    request.on("error", () => finish(false));
    request.on("data", () => {});
    request.on("end", () => {
      finish(status === 200);
    });
    request.end("{}");
  });
}

function googleConfig() {
  const issuerId = String(process.env.GOOGLE_WALLET_ISSUER_ID || ""),
    encoded = String(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_BASE64 || ""),
    plain = String(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON || "");
  if (!issuerId || (!encoded && !plain)) return null;
  try {
    const credentials = JSON.parse(encoded ? Buffer.from(encoded, "base64").toString("utf8") : plain);
    return credentials.client_email && credentials.private_key
      ? { issuerId, credentials }
      : null;
  } catch {
    return null;
  }
}

async function googleAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000),
    header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    claim = b64(JSON.stringify({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/wallet_object.issuer",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })),
    unsigned = `${header}.${claim}`,
    signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), credentials.private_key).toString("base64url"),
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`,
      }),
      signal: AbortSignal.timeout(10000),
    });
  if (!response.ok) throw new Error(`google_wallet_token_${response.status}`);
  return (await response.json()).access_token;
}

const googleClassCache = new Set();
async function upsertGooglePassObject(genericObject) {
  const config = googleConfig();
  if (!config) throw new Error("google_wallet_not_configured");
  const token = await googleAccessToken(config.credentials),
    headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    classId = String(genericObject?.classId || ""),
    objectId = String(genericObject?.id || "");
  if (!classId || !objectId) throw new Error("google_wallet_object_invalid");

  if (!googleClassCache.has(classId)) {
    const classResponse = await fetch(
      "https://walletobjects.googleapis.com/walletobjects/v1/genericClass",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ id: classId }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!classResponse.ok && classResponse.status !== 409)
      throw new Error(`google_wallet_class_${classResponse.status}`);
    googleClassCache.add(classId);
  }

  const insertResponse = await fetch(
    "https://walletobjects.googleapis.com/walletobjects/v1/genericObject",
    {
      method: "POST",
      headers,
      body: JSON.stringify(genericObject),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (insertResponse.ok) return "created";
  if (insertResponse.status !== 409)
    throw new Error(`google_wallet_insert_${insertResponse.status}`);

  const updateResponse = await fetch(
    `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(objectId)}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(genericObject),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!updateResponse.ok)
    throw new Error(`google_wallet_update_${updateResponse.status}`);
  return "updated";
}

const localised = (value) => ({ defaultValue: { language: "en-GB", value: String(value) } });

async function updateGooglePass(identity, changes) {
  const config = googleConfig();
  if (!config) return "not_configured";
  const token = await googleAccessToken(config.credentials),
    objectId = `${config.issuerId}.youcount_${identity.id}`,
    memberName = `${changes.firstName || ""} ${changes.lastName || ""}`.trim() || "TLC Cardholder",
    role = identity.role_code === "A" ? "Ordained leader" : identity.role_code === "B" ? "Connect member" : "TLC attendee",
    homeLocation = String(changes.tlcLocation || "The Liberty Church"),
    response = await fetch(
      `https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(objectId)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          header: localised(memberName),
          subheader: localised(identity.public_id),
          hexBackgroundColor: "#003264",
          barcode: {
            type: "QR_CODE",
            value: identity.identity_number,
            alternateText: identity.identity_number,
          },
          textModulesData: [
            { id: "number", header: "YOUCOUNT NUMBER", body: identity.public_id },
            { id: "role", header: "ROLE", body: role },
            { id: "home", header: "LOCATION", body: homeLocation },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
  if (response.status === 404) return "not_installed";
  if (!response.ok) throw new Error(`google_wallet_update_${response.status}`);
  return "updated";
}

async function notifyWalletUpdate(db, identityId) {
  const identities = await db.query(
    `SELECT id,public_id,identity_number,role_code,connect_eligible
     FROM tlc_identities WHERE id=$1`,
    [identityId],
  );
  const identity = identities[0];
  if (!identity) return { apple: 0, google: "missing" };
  await db.query("UPDATE wallet_pass_state SET updated_at=now() WHERE identity_id=$1", [identityId]);
  const devices = await db.query(
    `SELECT d.push_token FROM wallet_registrations r
     JOIN wallet_devices d ON d.device_library_id=r.device_library_id
     WHERE r.identity_id=$1`,
    [identityId],
  );
  const appleResults = await Promise.all(devices.map((row) => applePushToken(row.push_token)));
  let changes = {};
  const records = await db.query(
    "SELECT submitted_payload FROM review_records WHERE identity_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 1",
    [identityId],
  );
  try { changes = L.decrypt(records[0]?.submitted_payload)?.changes || {}; } catch {}
  let google = "not_attempted";
  try { google = await updateGooglePass(identity, changes); } catch (error) {
    console.error("Google Wallet OTA update failed", error.message);
    google = "failed";
  }
  return { apple: appleResults.filter(Boolean).length, google };
}

module.exports = { notifyWalletUpdate, upsertGooglePassObject };
