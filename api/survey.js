const L = require("./_lib");

const VERSION = "church-health-pilot-1";
const allowed = new Set([
  "campus",
  "belonging",
  "spiritualGrowth",
  "worship",
  "pastoralCare",
  "groups",
  "serving",
  "communication",
  "safety",
  "recommend",
  "barriers",
  "support",
  "comments",
]);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return L.json(res, 405, { ok: false });
  try {
    const db = await L.initDb();
    const raw = req.body?.answers;
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return L.json(res, 400, {
        ok: false,
        message: "Please complete the survey.",
      });
    const answers = Object.fromEntries(
      Object.entries(raw)
        .filter(([key]) => allowed.has(key))
        .map(([key, value]) => [
          key,
          String(value ?? "")
            .trim()
            .slice(0, key === "comments" ? 2000 : 500),
        ]),
    );
    if (!answers.belonging || !answers.spiritualGrowth || !answers.safety)
      return L.json(res, 400, {
        ok: false,
        message: "Please answer the required questions.",
      });
    const surveyId = String(req.body?.surveyId || "").slice(0, 100);
    if (!/^[a-zA-Z0-9_-]{24,100}$/.test(surveyId))
      return L.json(res, 400, {
        ok: false,
        message: "Please refresh the survey and try again.",
      });
    if (
      !(await L.consumeRate(
        db,
        "anonymous_survey_device",
        L.hash(`survey-device:${surveyId}`),
        3,
        1440,
      ))
    )
      return L.json(res, 429, {
        ok: false,
        message: "This survey has already been submitted from this browser.",
      });
    if (
      !(await L.consumeRate(
        db,
        "anonymous_survey_network",
        L.hash(L.clientIp(req)),
        2000,
        1440,
      ))
    )
      return L.json(res, 429, {
        ok: false,
        message: "This network has reached today’s safety limit.",
      });
    await db.query(
      "INSERT INTO survey_responses(survey_version,response_payload) VALUES($1,$2)",
      [VERSION, L.encrypt({ answers })],
    );
    return L.json(res, 200, { ok: true });
  } catch {
    return L.json(res, 503, {
      ok: false,
      message: "The survey is temporarily unavailable.",
    });
  }
};
