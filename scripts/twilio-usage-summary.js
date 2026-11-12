const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "");
const authToken = String(process.env.TWILIO_AUTH_TOKEN || "");

if (!accountSid || !authToken) {
  console.error("Twilio credentials are not configured.");
  process.exit(1);
}

const categories = [
  "sms",
  "sms-outbound",
  "authy-sms-outbound",
  "authy-phone-verifications",
  "totalprice",
];
const periods = ["AllTime", "ThisMonth", "Today"];
const authorization = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

async function read(period, category) {
  const url = new URL(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Usage/Records/${period}.json`,
  );
  url.searchParams.set("Category", category);
  const response = await fetch(url, {
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Twilio usage request failed: ${response.status}`);
  const record = (await response.json()).usage_records?.[0];
  return record
    ? {
        category: record.category,
        count: Number(record.count || 0),
        countUnit: record.count_unit,
        usage: Number(record.usage || 0),
        usageUnit: record.usage_unit,
        price: Number(record.price || 0),
        currency: String(record.price_unit || "").toUpperCase(),
        startDate: record.start_date,
        endDate: record.end_date,
        asOf: record.as_of,
      }
    : { category, count: 0, usage: 0, price: 0 };
}

async function main() {
  const result = {};
  for (const period of periods)
    result[period] = await Promise.all(categories.map((category) => read(period, category)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
