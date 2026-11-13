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
const requiredScaleAnswers = [
  "belonging",
  "spiritualGrowth",
  "worship",
  "pastoralCare",
  "groups",
  "serving",
  "communication",
  "safety",
  "recommend",
];

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
    if (
      requiredScaleAnswers.some(
        (key) => !/^[1-5]$/.test(String(answers[key] || "")),
      )
    )
      return L.json(res, 400, {
        ok: false,
        message:
          "Please answer every scored question before submitting the survey.",
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
