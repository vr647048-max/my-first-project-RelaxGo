const C=window.THERAPY_CONFIG || window.RELAXGO_CONFIG || {};
const PUBLIC_ADMIN_URL="https://vr647048-max.github.io/my-first-project-RelaxGo/admin.html";

// Browser geolocation requires a secure context. If this page is opened directly
// as a local file, send the provider to the official HTTPS dashboard automatically.
if(location.protocol==="file:" || (!window.isSecureContext && !["localhost","127.0.0.1","[::1]"].includes(location.hostname))){
  location.replace(PUBLIC_ADMIN_URL);
}

const sb=(typeof window.supabase!=="undefined" && typeof C.SUPABASE_URL==="string" && C.SUPABASE_URL.startsWith("http") && typeof C.SUPABASE_ANON_KEY==="string" && (C.SUPABASE_ANON_KEY.startsWith("ey") || C.SUPABASE_ANON_KEY.startsWith("sb_")))?window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY):null;
let bookings=[],watchers={},realtimeChannel=null,locationState={};
const nextStatus={New:"Accepted",Accepted:"On the Way","On the Way":"Arrived",Arrived:"Completed"};

async function init(){
  if(!sb){showLogin("Supabase is not configured. Check config.js.");return}
  const {data:{session}}=await sb.auth.getSession();
  if(session) showDash(); else showLogin();
  sb.auth.onAuthStateChange((_e,s)=>s?showDash():showLogin());
}
function showLogin(msg=""){
  document.getElementById("loginPanel").classList.remove("hidden");
  document.getElementById("dashboardPanel").classList.add("hidden");
  document.getElementById("loginMsg").textContent=msg;
}
async function showDash(){
  document.getElementById("loginPanel").classList.add("hidden");
  document.getElementById("dashboardPanel").classList.remove("hidden");
  await load();
  if(realtimeChannel) sb.removeChannel(realtimeChannel);
  realtimeChannel=sb.channel("all-bookings").on("postgres_changes",{event:"*",schema:"public",table:"bookings"},load).subscribe();
}
document.getElementById("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!sb)return;
  const {error}=await sb.auth.signInWithPassword({email:email.value.trim(),password:password.value});
  if(error)loginMsg.textContent=error.message;
});
async function load(){
  const {data,error}=await sb.from("bookings").select("*").order("created_at",{ascending:false});
  if(error){document.getElementById("bookingList").innerHTML='<div class="empty"><h2>Could not load bookings</h2><p>'+esc(error.message)+'</p></div>';return}
  bookings=data||[];render();
}
function normalizedStatus(status){
  const s=String(status||"").trim().toLowerCase();
  if(!s || s==="pending" || s==="new") return "New";
  if(s==="accepted") return "Accepted";
  if(s==="on the way" || s==="on_way" || s==="on-the-way") return "On the Way";
  if(s==="arrived") return "Arrived";
  if(s==="completed" || s==="complete") return "Completed";
  return String(status).trim() || "New";
}
function render(){
  const counts={New:0,"On the Way":0,Completed:0};
  bookings.forEach(b=>{const s=normalizedStatus(b.status);counts[s]=(counts[s]||0)+1});
  stats.innerHTML=`<div class="stat"><b>${bookings.length}</b><span>Total</span></div><div class="stat"><b>${counts.New||0}</b><span>New</span></div><div class="stat"><b>${counts["On the Way"]||0}</b><span>On the way</span></div><div class="stat"><b>${counts.Completed||0}</b><span>Completed</span></div>`;
  bookingList.innerHTML=bookings.length?bookings.map(card).join(""):'<div class="empty"><h2>No bookings yet</h2><p>Customer bookings will appear here in real time.</p></div>';
  const active = bookings.filter(b=>["On the Way","Arrived"].includes(normalizedStatus(b.status)));
  if(active.length===1 && !watchers[active[0].id] && !locationState[active[0].id]){
    shareLocation(active[0].id,true);
  }
}
function card(b){
  const current=normalizedStatus(b.status);
  const next=nextStatus[current]||"";
  const bookingId=String(b.booking_code||b.id);
  const phone=String(b.customer_phone||"").replace(/\D/g,"").slice(-10);
  const wa=phone?`https://wa.me/91${phone}?text=${encodeURIComponent("TherapyOnWay "+bookingId+": provider update — "+(next||current))}`:"#";
  return `<article class="booking"><div class="booking-top"><div><div class="booking-id">${esc(bookingId)}</div><h2>${esc(b.customer_name)}</h2><div>${esc(b.service)} • ₹${Number(b.price||0).toLocaleString("en-IN")}</div></div><span class="status">${esc(current)}</span></div>
  <div class="booking-info"><div class="info"><small>Appointment</small>${esc(b.booking_date)} • ${esc(b.booking_time)}</div><div class="info"><small>Phone</small>${esc(b.customer_phone)}</div><div class="info"><small>Customer GPS</small>${b.customer_lat != null && b.customer_lng != null ? `${Number(b.customer_lat).toFixed(6)}, ${Number(b.customer_lng).toFixed(6)}` : 'Location unavailable'}</div></div>
  <div class="booking-actions">${b.customer_lat != null && b.customer_lng != null ? `<a class="map" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.customer_lat+","+b.customer_lng)}">📍 Navigate</a>` : ""}${phone?`<a class="wa" target="_blank" rel="noopener" href="${wa}">WhatsApp</a>`:""}${b.customer_phone?`<a class="secondary" href="tel:${esc(b.customer_phone)}">☎ Call</a>`:""}${next?`<button class="accept" onclick="setStatus('${escAttr(b.id)}','${escAttr(next)}')">${next==="On the Way"?"🚗 On the Way":next==="Completed"?"✓ Complete":next}</button>`:""}${["Accepted","On the Way","Arrived"].includes(current)?`<button class="map" onclick="shareLocation('${escAttr(b.id)}')">📡 ${watchers[b.id]?"Sharing Live Location":"Share Live Location"}</button>`:""}${locationState[b.id]?`<div class="location-state">${esc(locationState[b.id])}</div>`:""}</div></article>`;
}
async function setStatus(id,status){
  const {error}=await sb.from("bookings").update({status}).eq("id",id);
  if(error){alert("Could not update booking: "+error.message);return;}
  if(status === "On the Way") shareLocation(id,true);
  if(status === "Completed") stopLocation(id);
  await load();
}
function stopLocation(id,clearState=true){
  if(watchers[id]){
    navigator.geolocation.clearWatch(watchers[id]);
    delete watchers[id];
  }
  if(clearState) delete locationState[id];
}
async function saveProviderLocation(id,p){
  const lat=Number(p?.coords?.latitude);
  const lng=Number(p?.coords?.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)){
    locationState[id]="GPS returned an invalid location.";
    render();
    return false;
  }
  const {error}=await sb.from("bookings").update({provider_lat:lat,provider_lng:lng}).eq("id",id);
  if(error){
    console.error("provider location update failed",error);
    locationState[id]="GPS captured, but Supabase could not save it: "+String(error.message||error);
    render();
    return false;
  }
  const {data:row,error:readError}=await sb.from("bookings").select("provider_lat,provider_lng").eq("id",id).maybeSingle();
  if(readError || !row || row.provider_lat==null || row.provider_lng==null){
    locationState[id]="GPS was captured, but the saved location could not be verified.";
    console.error("provider location verification failed",readError,row);
    render();
    return false;
  }
  locationState[id]="Live location is sharing.";
  render();
  return true;
}

async function showGpsPermissionState(id){
  if(!navigator.permissions?.query)return;
  try{
    const p=await navigator.permissions.query({name:"geolocation"});
    if(p.state==="denied"){
      locationState[id]="Location permission is blocked for this site. Open Chrome site settings and allow Location, then try again.";
      render();
    }
  }catch(_e){}
}

function shareLocation(id,silent=false){
  if(!window.isSecureContext && !["localhost","127.0.0.1","[::1]"].includes(location.hostname)){
    locationState[id]="Secure HTTPS is required for live GPS. Opening the official TherapyOnWay provider dashboard…";
    render();
    if(!silent) location.assign(PUBLIC_ADMIN_URL);
    return false;
  }
  if(!navigator.geolocation){
    locationState[id]="GPS is not supported by this browser.";
    render();
    if(!silent) alert(locationState[id]);
    return false;
  }
  if(watchers[id]){
    locationState[id]="Live location is sharing.";
    render();
    return true;
  }
  locationState[id]="Requesting GPS permission…";
  render();
  showGpsPermissionState(id);

  let firstFix=true;
  const success=async p=>{
    const saved=await saveProviderLocation(id,p);
    if(saved && firstFix && !silent){
      alert("Live location is sharing. Keep this dashboard open while travelling.");
      firstFix=false;
    }
  };
  const failure=e=>{
    const msg=e && e.code===1 ? "GPS permission denied. Allow Location for this HTTPS site." : e && e.code===2 ? "GPS location unavailable. Turn on Windows Location Services and keep Wi‑Fi on." : "GPS timed out. Keep Location/Wi‑Fi on and try again.";
    locationState[id]=msg;
    stopLocation(id,false);
    render();
    if(!silent) alert(msg);
  };

  navigator.geolocation.getCurrentPosition(success,failure,{enableHighAccuracy:true,maximumAge:0,timeout:30000});
  watchers[id]=navigator.geolocation.watchPosition(success,failure,{enableHighAccuracy:true,maximumAge:3000,timeout:15000});
  return true;
}
async function logout(){
  Object.keys(watchers).forEach(stopLocation);
  watchers={};
  locationState={};
  await sb.auth.signOut();
}
window.addEventListener("beforeunload",()=>Object.keys(watchers).forEach(stopLocation));
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function escAttr(s){return String(s??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
init();
