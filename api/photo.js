const { Readable } = require("stream");
const { get } = require("@vercel/blob");
const L = require("./_lib");
const COOKIE = "tlc_admin";
const CHECKIN_COOKIE = "tlc_checkin_staff";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
function allowedPlanningCenterPhoto(url) {
  try {
    const parsed = new URL(url);
    const allowed = [
      "planningcenteronline.com",
      "pcoservices.com",
      "cloudfront.net",
      "amazonaws.com",
    ];
    return (
      parsed.protocol === "https:" &&
      allowed.some(
        (host) =>
          parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
      )
    );
  } catch {
    return false;
  }
}
async function sendPlanningCenterPhoto(res, url) {
  if (!allowedPlanningCenterPhoto(url)) return false;
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(5000),
  });
  const type = String(response.headers.get("content-type") || "");
  if (
    !response.ok ||
    !allowedPlanningCenterPhoto(response.url) ||
    !type.startsWith("image/")
  )
    return false;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) return false;
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Length", String(bytes.length));
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("Content-Disposition", 'inline; filename="member-photo"');
  res.status(200).send(bytes);
  return true;
}
function authorisation(req) {
  const cookies = Object.fromEntries(String(req.headers.cookie || "").split(";").map((x) => x.trim().split("=")).filter((x) => x.length === 2));
  const value = cookies[COOKIE];
  if (value) {
    const [exp, sig] = value.split(".");
    if (Number(exp) > Date.now() && L.safeEqual(sig || "", L.hash(`admin:${exp}`)))
      return "admin";
  }
  const scanner = cookies[CHECKIN_COOKIE];
  if (scanner) {
    const [exp, sig] = scanner.split(".");
    if (Number(exp) > Date.now() && L.safeEqual(sig || "", L.hash(`checkin-staff:${exp}`)))
      return "checkin";
  }
  return "";
}
module.exports = async function handler(req, res) {
  if (req.method !== "GET") return L.json(res, 405, { ok: false });
  const role = authorisation(req);
  if (!role) return L.json(res, 401, { ok: false });
  try {
    const id = Number(req.query?.record);
    if (!Number.isSafeInteger(id) || id < 1) return L.json(res, 400, { ok: false });
    const db = await L.initDb();
    const rows = await db.query(
      `SELECT r.submitted_payload,r.planning_center_ids
       FROM review_records r
       WHERE r.id=$1
         AND ($2='admin' OR EXISTS (
           SELECT 1 FROM checkin_events c
           WHERE c.identity_id=r.identity_id
             AND c.service_date=(now() AT TIME ZONE 'Europe/London')::date
         ))`,
      [id, role],
    );
    if (!rows[0]) return L.json(res, 404, { ok: false });
    const photo = L.decrypt(rows[0].submitted_payload)?.changes?.photo;
    const pathname = String(photo?.pathname || "");
    if (pathname.startsWith("member-photos/")) {
      const result = await get(pathname, { access: "private" });
      if (!result || result.statusCode !== 200)
        return L.json(res, 404, { ok: false });
      res.setHeader("Content-Type", result.blob.contentType);
      res.setHeader("Content-Length", String(result.blob.size));
      res.setHeader("Cache-Control", "private, max-age=60");
      res.setHeader("Content-Disposition", 'inline; filename="member-photo"');
      return Readable.fromWeb(result.stream).pipe(res);
    }
    const savedAvatar = String(photo?.url || "");
    if (savedAvatar && (await sendPlanningCenterPhoto(res, savedAvatar))) return;
    const planningCenterIds = L.decrypt(rows[0].planning_center_ids) || [];
    for (const personId of planningCenterIds) {
      try {
        const person = await L.pcFetch(`/people/${encodeURIComponent(personId)}`);
        const avatar = String(person?.data?.attributes?.avatar || "");
        if (avatar && (await sendPlanningCenterPhoto(res, avatar))) return;
      } catch {}
    }
    return L.json(res, 404, { ok: false });
  } catch { return L.json(res, 404, { ok: false }); }
};
