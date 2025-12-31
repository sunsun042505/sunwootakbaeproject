
const j = (v)=>JSON.stringify(v);
export const digitsOnly = (s)=>String(s||"").replace(/\D/g,"");
export async function apiGet(path){
  const r = await fetch(path, {cache:"no-store"});
  const t = await r.text();
  let o; try{o=JSON.parse(t)}catch{ o={raw:t} }
  if(!r.ok) throw new Error(o?.error || ("HTTP_"+r.status));
  return o;
}
export async function apiPost(path, body){
  const r = await fetch(path, {
    method:"POST",
    headers: {"Content-Type":"application/json"},
    body: j(body),
    cache:"no-store"
  });
  const t = await r.text();
  let o; try{o=JSON.parse(t)}catch{ o={raw:t} }
  if(!r.ok) throw new Error(o?.error || ("HTTP_"+r.status));
  return o;
}
export function pad2(n){return String(n).padStart(2,"0")}
export function startClock(el){
  setInterval(()=>{
    const d=new Date();
    el.textContent=`${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  },500);
}
export function prefixByType(t){
  return ({DOMESTIC:"81",INTERNATIONAL:"23",ECONOMY_CVS:"30",RETURN:"37"})[t]||"81";
}
export function make18(prefix2){
  let s=String(prefix2);
  while(s.length<18) s += Math.floor(Math.random()*10);
  return s.slice(0,18);
}
export function make12(){
  let s=""; for(let i=0;i<12;i++) s+=Math.floor(Math.random()*10);
  return s;
}
