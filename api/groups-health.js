const { pcAppFetch, json } = require("./_lib");
module.exports=async function handler(req,res){
  if(req.method!=="GET")return json(res,405,{ok:false});
  if(!process.env.pc_clientid||!process.env.pc_secret)return json(res,503,{ok:false,service:"planning-center-groups",reason:"not_configured"});
  try{const result=await pcAppFetch("groups","/group_types?per_page=1");return json(res,200,{ok:true,service:"planning-center-groups",mode:"read-only",groupTypesAccessible:Array.isArray(result.data)});}catch{return json(res,502,{ok:false,service:"planning-center-groups",reason:"upstream_rejected"})}
};
