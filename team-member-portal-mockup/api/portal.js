const L = require("./_lib");
const demoTeams=[
  {id:"media",name:"Media & Production",lead:"Timothy Oluwatimilehin",location:"Woodford",purpose:"Sound, visuals, broadcast and digital storytelling."},
  {id:"welcome",name:"Welcome Team",lead:"Esther Adebayo",location:"Woodford",purpose:"Help every person feel seen and at home."},
  {id:"kids",name:"Liberty Kids",lead:"Rachel Williams",location:"Woodford",purpose:"Create a safe, joyful environment for children."},
  {id:"prayer",name:"Prayer Team",lead:"Miriam Lewis",location:"Camberwell",purpose:"Cover our church and gatherings in prayer."}
];
const demoSchedule=[{id:"s1",date:"2026-08-23",title:"Sunday Celebration Service",team:"Media & Production",role:"Camera 2",callTime:"08:15",serviceTime:"10:00",location:"Woodford Campus",reportTo:"Production desk",status:"Confirmed"},{id:"s2",date:"2026-08-30",title:"Sunday Celebration Service",team:"Welcome Team",role:"Main entrance host",callTime:"08:45",serviceTime:"10:00",location:"Woodford Campus",reportTo:"Welcome desk",status:"Pending"}];
const memory={requests:[],roles:[],docs:[{id:"guide-1",title:"Our serving culture",summary:"How we serve together at TLC.",team_name:"All teams",file_type:"GUIDE",content:"We serve with preparation, kindness, accountability and care.",version:1,owner_name:"Talent Management",permission:"read"}]};
const body = req => typeof req.body === "string" ? JSON.parse(req.body||"{}") : (req.body||{});
async function bootstrap(db,user){
  let requests=memory.requests,roles=memory.roles,docs=memory.docs;
  if(db){requests=await db.query("SELECT * FROM portal_join_requests WHERE person_id=$1 OR $2='staff' OR ($2='lead' AND team_id=$3) ORDER BY created_at DESC",[user.id,user.role,user.teamId||""]);roles=await db.query("SELECT * FROM portal_role_assignments ORDER BY created_at DESC");docs=await db.query(`SELECT d.*,v.content,v.version,COALESCE(p.permission,'read') permission FROM portal_documents d LEFT JOIN LATERAL (SELECT content,version FROM portal_document_versions WHERE document_id=d.id ORDER BY version DESC LIMIT 1) v ON true LEFT JOIN portal_document_permissions p ON p.document_id=d.id AND p.person_id=$1 ORDER BY d.updated_at DESC`,[user.id]);}
  else if(user.role==="member") requests=requests.filter(x=>x.person_id===user.id); else if(user.role==="lead") requests=requests.filter(x=>x.team_id===user.teamId);
  return {user,teams:demoTeams,schedule:demoSchedule,requests,roles,documents:docs,source:{planningCenter:Boolean(process.env.pc_clientid),database:Boolean(db)}};
}
module.exports=async(req,res)=>{try{
  const action=String(req.query.action||"bootstrap"), method=req.method;
  if(action==="login"&&method==="POST"){
    const input=body(req); if(process.env.PORTAL_DEMO_MODE==="false") return L.json(res,503,{error:"Identity provider is not configured yet."});
    const users={member:{id:"pc-amara",name:"Amara Nwosu",role:"member",teamId:"media"},lead:{id:"pc-timothy",name:"Timothy Oluwatimilehin",role:"lead",teamId:"media"},staff:{id:"pc-mide",name:"Mide Adebayo",role:"staff",teamId:null}};
    const user=users[input.role]||users.member; L.setSession(res,user); return L.json(res,200,{user});
  }
  if(action==="logout"){L.clearSession(res);return L.json(res,200,{ok:true});}
  const user=L.session(req); if(!user)return L.json(res,401,{error:"Sign in required"});
  const db=await L.database(); await L.migrate(db);
  if(action==="bootstrap")return L.json(res,200,await bootstrap(db,user));
  const input=body(req);
  if(action==="join"&&method==="POST"){
    const team=demoTeams.find(x=>x.id===input.teamId);if(!team)return L.json(res,400,{error:"Choose a valid team"});const row={id:L.id(),person_id:user.id,person_name:user.name,team_id:team.id,team_name:team.name,message:String(input.message||"").slice(0,1000),status:"pending"};
    if(db)await db.query("INSERT INTO portal_join_requests(id,person_id,person_name,team_id,team_name,message) VALUES($1,$2,$3,$4,$5,$6)",[row.id,row.person_id,row.person_name,row.team_id,row.team_name,row.message]);else memory.requests.unshift(row);await L.audit(db,user,"join.request",row.id,{team:team.name});return L.json(res,201,row);
  }
  if(action==="decide"&&method==="POST"){
    if(!L.requireRole(user,["lead","staff"]))return L.json(res,403,{error:"Lead access required"});const status=input.status==="approved"?"approved":"declined";
    if(db){const target=await db.query("SELECT team_id FROM portal_join_requests WHERE id=$1",[input.id]);if(!target[0]||(user.role==="lead"&&target[0].team_id!==user.teamId))return L.json(res,403,{error:"This request is outside your team"});await db.query("UPDATE portal_join_requests SET status=$1,decided_by=$2,decision_note=$3,decided_at=now() WHERE id=$4",[status,user.name,String(input.note||"").slice(0,500),input.id]);}else{const r=memory.requests.find(x=>x.id===input.id);if(!r||(user.role==="lead"&&r.team_id!==user.teamId))return L.json(res,403,{error:"This request is outside your team"});r.status=status;}await L.audit(db,user,`join.${status}`,input.id);return L.json(res,200,{ok:true});
  }
  if(action==="appoint"&&method==="POST"){
    if(!L.requireRole(user,["staff"]))return L.json(res,403,{error:"Talent Management access required"});const role=input.role==="staff"?"staff":"lead",team=demoTeams.find(x=>x.id===input.teamId);const row={id:L.id(),person_id:String(input.personId||""),person_name:String(input.personName||""),role,team_id:role==="lead"?team?.id:null,team_name:role==="lead"?team?.name:null,status:"active",granted_by:user.name};if(!row.person_id||!row.person_name||role==="lead"&&!team)return L.json(res,400,{error:"Complete the appointment details"});if(db)await db.query("INSERT INTO portal_role_assignments(id,person_id,person_name,role,team_id,team_name,granted_by) VALUES($1,$2,$3,$4,$5,$6,$7)",[row.id,row.person_id,row.person_name,row.role,row.team_id,row.team_name,row.granted_by]);else memory.roles.unshift(row);await L.audit(db,user,"role.appoint",row.id,{role,team:row.team_name});return L.json(res,201,row);
  }
  if(action==="document"&&method==="POST"){
    if(!L.requireRole(user,["lead","staff"]))return L.json(res,403,{error:"Editor access required"});const docId=input.id||L.id(),title=String(input.title||"").trim(),content=String(input.content||""),team=demoTeams.find(x=>x.id===input.teamId);if(!title)return L.json(res,400,{error:"Title is required"});
    if(db){const found=await db.query("SELECT id FROM portal_documents WHERE id=$1",[docId]);if(found.length){const versions=await db.query("SELECT COALESCE(MAX(version),0)+1 next FROM portal_document_versions WHERE document_id=$1",[docId]);await db.query("UPDATE portal_documents SET title=$1,summary=$2,updated_at=now() WHERE id=$3",[title,String(input.summary||""),docId]);await db.query("INSERT INTO portal_document_versions(id,document_id,version,content,created_by) VALUES($1,$2,$3,$4,$5)",[L.id(),docId,versions[0].next,content,user.name]);}else{await db.query("INSERT INTO portal_documents(id,title,summary,team_id,team_name,owner_id,owner_name) VALUES($1,$2,$3,$4,$5,$6,$7)",[docId,title,String(input.summary||""),team?.id||null,team?.name||"All teams",user.id,user.name]);await db.query("INSERT INTO portal_document_versions(id,document_id,version,content,created_by) VALUES($1,$2,1,$3,$4)",[L.id(),docId,content,user.name]);}}else{const old=memory.docs.find(x=>x.id===docId);if(old)Object.assign(old,{title,content,version:old.version+1});else memory.docs.unshift({id:docId,title,content,summary:input.summary||"",team_name:team?.name||"All teams",file_type:"GUIDE",owner_name:user.name,version:1,permission:"edit"});}await L.audit(db,user,"document.save",docId);return L.json(res,200,{id:docId});
  }
  if(action==="permission"&&method==="POST"){
    if(!L.requireRole(user,["lead","staff"]))return L.json(res,403,{error:"Lead access required"});const permission=input.permission==="edit"?"edit":"read";if(db)await db.query(`INSERT INTO portal_document_permissions(document_id,person_id,permission,granted_by) VALUES($1,$2,$3,$4) ON CONFLICT(document_id,person_id) DO UPDATE SET permission=excluded.permission,granted_by=excluded.granted_by,updated_at=now()`,[input.documentId,input.personId,permission,user.name]);await L.audit(db,user,"document.permission",input.documentId,{personId:input.personId,permission});return L.json(res,200,{ok:true});
  }
  if(action==="upload"&&method==="POST"){
    if(!L.requireRole(user,["lead","staff"]))return L.json(res,403,{error:"Editor access required"});
    const allowed={"application/pdf":"PDF","text/csv":"CSV","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"DOCX"},fileType=allowed[input.mime];if(!fileType)return L.json(res,400,{error:"Upload a DOCX, PDF or CSV file"});const raw=Buffer.from(String(input.base64||""),"base64");if(!raw.length||raw.length>3*1024*1024)return L.json(res,400,{error:"File must be 3 MB or smaller in version one"});if(!process.env.BLOB_READ_WRITE_TOKEN)return L.json(res,503,{error:"File storage is not configured"});
    const {put}=require("@vercel/blob"),safeName=String(input.name||`source.${fileType.toLowerCase()}`).replace(/[^a-zA-Z0-9._-]/g,"-");const blob=await put(`team-guides/${Date.now()}-${safeName}`,raw,{access:"public",contentType:input.mime,token:process.env.BLOB_READ_WRITE_TOKEN});const docId=L.id(),team=demoTeams.find(x=>x.id===input.teamId),title=String(input.title||safeName.replace(/\.[^.]+$/,""));
    if(db){await db.query("INSERT INTO portal_documents(id,title,summary,team_id,team_name,file_type,source_url,owner_id,owner_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[docId,title,"Uploaded source file",team?.id||null,team?.name||"All teams",fileType,blob.url,user.id,user.name]);await db.query("INSERT INTO portal_document_versions(id,document_id,version,content,source_url,created_by) VALUES($1,$2,1,$3,$4,$5)",[L.id(),docId,"Editable content can be added here while the original source remains preserved.",blob.url,user.name]);}else memory.docs.unshift({id:docId,title,summary:"Uploaded source file",team_name:team?.name||"All teams",file_type:fileType,source_url:blob.url,content:"Editable content can be added here while the original source remains preserved.",version:1,owner_name:user.name,permission:"edit"});await L.audit(db,user,"document.upload",docId,{fileType});return L.json(res,201,{id:docId,url:blob.url});
  }
  return L.json(res,404,{error:"Unknown action"});
}catch(error){console.error(error);return L.json(res,500,{error:error.message==="planning_center_unavailable"?"Planning Center is temporarily unavailable":"Something went wrong"});}};
