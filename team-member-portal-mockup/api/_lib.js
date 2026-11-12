const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");

const dbUrl = () => process.env.DATABASE_URL || process.env.tlc_DATABASE_URL;
const secret = () => process.env.SESSION_SECRET || "local-development-only";
const json = (res, status, body) => { res.setHeader("Cache-Control", "no-store"); return res.status(status).json(body); };
const id = () => crypto.randomUUID();
const sign = value => crypto.createHmac("sha256", secret()).update(value).digest("base64url");
const token = payload => { const body = Buffer.from(JSON.stringify(payload)).toString("base64url"); return `${body}.${sign(body)}`; };
const verify = raw => { try { const [body, mac] = String(raw || "").split("."); if (!body || !mac || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(sign(body)))) return null; const data = JSON.parse(Buffer.from(body, "base64url")); return data.exp > Date.now() ? data : null; } catch { return null; } };
const cookies = req => Object.fromEntries(String(req.headers.cookie || "").split(";").map(x => x.trim().split("=")).filter(x => x.length === 2));
const session = req => verify(cookies(req).tlc_portal);
const setSession = (res, person) => res.setHeader("Set-Cookie", `tlc_portal=${token({...person,exp:Date.now()+8*60*60*1000})}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${process.env.VERCEL ? "; Secure" : ""}`);
const clearSession = res => res.setHeader("Set-Cookie", "tlc_portal=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
const requireRole = (user, roles) => user && roles.includes(user.role);
const pcAuth = () => `Basic ${Buffer.from(`${process.env.pc_clientid}:${process.env.pc_secret}`).toString("base64")}`;
async function pc(app, path) { if (!process.env.pc_clientid || !process.env.pc_secret) return null; const r = await fetch(`https://api.planningcenteronline.com/${app}/v2${path}`, {headers:{Authorization:pcAuth(),Accept:"application/json","User-Agent":"TLC Team Member Portal"}}); if (!r.ok) throw new Error("planning_center_unavailable"); return r.json(); }
async function database() { if (!dbUrl()) return null; return neon(dbUrl()); }
async function migrate(db) {
  if (!db) return;
  await db.query(`CREATE TABLE IF NOT EXISTS portal_join_requests (id text PRIMARY KEY, person_id text NOT NULL, person_name text NOT NULL, team_id text NOT NULL, team_name text NOT NULL, message text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending', decided_by text, decision_note text, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz)`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_role_assignments (id text PRIMARY KEY, person_id text NOT NULL, person_name text NOT NULL, role text NOT NULL, team_id text, team_name text, status text NOT NULL DEFAULT 'active', granted_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_documents (id text PRIMARY KEY, title text NOT NULL, summary text NOT NULL DEFAULT '', team_id text, team_name text NOT NULL DEFAULT 'All teams', file_type text NOT NULL DEFAULT 'GUIDE', source_url text, owner_id text NOT NULL, owner_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_document_versions (id text PRIMARY KEY, document_id text NOT NULL REFERENCES portal_documents(id) ON DELETE CASCADE, version integer NOT NULL, content text NOT NULL DEFAULT '', source_url text, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(document_id,version))`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_document_permissions (document_id text NOT NULL REFERENCES portal_documents(id) ON DELETE CASCADE, person_id text NOT NULL, permission text NOT NULL, granted_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(document_id,person_id))`);
  await db.query(`CREATE TABLE IF NOT EXISTS portal_audit (id bigserial PRIMARY KEY, actor_id text NOT NULL, actor_name text NOT NULL, action text NOT NULL, target text, detail jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now())`);
}
async function audit(db, user, action, target, detail={}) { if (db) await db.query("INSERT INTO portal_audit(actor_id,actor_name,action,target,detail) VALUES($1,$2,$3,$4,$5)",[user.id,user.name,action,target||null,JSON.stringify(detail)]); }
module.exports={json,id,session,setSession,clearSession,requireRole,pc,database,migrate,audit};
