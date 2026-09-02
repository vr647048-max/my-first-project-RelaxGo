const C=window.THERAPY_CONFIG || window.RELAXGO_CONFIG || {};
const sb=(typeof window.supabase!=="undefined" && typeof C.SUPABASE_URL==="string" && C.SUPABASE_URL.startsWith("http") && typeof C.SUPABASE_ANON_KEY==="string" && (C.SUPABASE_ANON_KEY.startsWith("ey") || C.SUPABASE_ANON_KEY.startsWith("sb_")))?window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY):null;
let bookings=[],watchers={},gpsTimers={},realtimeChannel=null,locationState={},currentUser=null,currentProvider=null,isAdmin=false;
const nextStatus={New:"Accepted",Accepted:"On the Way","On the Way":"Arrived",Arrived:"Completed"};

async function init(){
  if(!sb){showLogin("Supabase is not configured. Check config.js.");return}
  const {data:{session}}=await sb.auth.getSession();
  if(session) await showDash(session); else showLogin();
  sb.auth.onAuthStateChange(async (_e,s)=>s?await showDash(s):showLogin());
}
async function resolveRole(session){
  currentUser=session?.user||null;
  currentProvider=null;
  isAdmin=!!currentUser && currentUser.id===String(C.ADMIN_USER_ID||"");
  if(isAdmin) return true;
  if(!currentUser) return false;
  const {data,error}=await sb.from("providers").select("id,user_id,name,is_available").eq("user_id",currentUser.id).maybeSingle();
  if(error){console.error("provider role lookup failed",error);return false;}
  currentProvider=data||null;
  return !!currentProvider;
}
function showLogin(msg=""){
  document.getElementById("loginPanel").classList.remove("hidden");
  document.getElementById("dashboardPanel").classList.add("hidden");
  document.getElementById("loginMsg").textContent=msg;
}
async function showDash(session){
  const allowed=await resolveRole(session);
  if(!allowed){
    await sb.auth.signOut();
    showLogin("This account is not authorized for the Provider Dashboard.");
    return;
  }
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
  // If the dashboard is refreshed while one job is already on the way,
  // resume live GPS automatically instead of making the provider find the button again.
  const active = bookings.filter(b=>["On the Way","Arrived"].includes(normalizedStatus(b.status)));
  if(active.length===1 && !watchers[active[0].id] && !gpsTimers[active[0].id]){
    shareLocation(active[0].id,true);
  }
}
function card(b){
  const current=normalizedStatus(b.status);
  const next=nextStatus[current]||"";
  const bookingId=String(b.booking_code||b.id);
  const phone=String(b.customer_phone||"").replace(/\D/g,"").slice(-10);
  const wa=phone?`https://wa.me/91${phone}?text=${encodeURIComponent("TherapyOnWay "+bookingId+": provider update — "+(next||current))}`:"#";
  return `<article class="booking"><div class="booking-top"><div><div class="booking-id">${esc(bookingId)}</div><h2>${esc(b.customer_name)}</h2><div>${esc(b.service)} • ₹${Number(b.price||0).toLocaleString("en-IN")} • ${String(b.payment_method||"online")==="cash"?"💵 Cash on Service":"💳 Online"}</div></div><span class="status">${esc(current)}</span></div>
  <div class="booking-info"><div class="info"><small>Appointment</small>${esc(b.booking_date)} • ${esc(b.booking_time)}</div><div class="info"><small>Phone</small>${esc(b.customer_phone)}</div><div class="info"><small>Customer GPS</small>${b.customer_lat != null && b.customer_lng != null ? `${Number(b.customer_lat).toFixed(6)}, ${Number(b.customer_lng).toFixed(6)}` : 'Location unavailable'}</div></div>
  <div class="booking-actions">${b.customer_lat != null && b.customer_lng != null ? `<a class="map" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.customer_lat+","+b.customer_lng)}">📍 Navigate</a>` : ""}${phone?`<a class="wa" target="_blank" rel="noopener" href="${wa}">WhatsApp</a>`:""}${b.customer_phone?`<a class="secondary" href="tel:${esc(b.customer_phone)}">☎ Call</a>`:""}${next?`<button class="accept" onclick="setStatus('${escAttr(b.id)}','${escAttr(next)}')">${next==="On the Way"?"🚗 On the Way":next==="Completed"?"✓ Complete":next}</button>`:""}${["Accepted","On the Way","Arrived"].includes(current)?`<button class="map" onclick="shareLocation('${escAttr(b.id)}')">📡 ${watchers[b.id]?"Sharing Live Location":"Share Live Location"}</button>`:""}${locationState[b.id]?`<div class="location-state">${esc(locationState[b.id])}</div>`:""}</div></article>`;
}
async function setStatus(id,status){
  const target=bookings.find(b=>String(b.id)===String(id));
  if(!target){alert("Booking not found. Refresh the dashboard.");return;}
  const patch={status};
  if(!isAdmin && currentProvider && !target.provider_id){ patch.provider_id=currentProvider.id; }
  const {error}=await sb.from("bookings").update(patch).eq("id",id);
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
  if(gpsTimers[id]){
    clearInterval(gpsTimers[id]);
    delete gpsTimers[id];
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
  // Verify the write using the authenticated provider session. This makes a
  // silent RLS/schema problem visible instead of leaving the customer page
  // stuck on “waiting for provider location”.
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

function shareLocation(id,silent=false){
  // Browser GPS requires HTTPS or localhost. Direct File C:/... pages are not reliable.
  if(!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1"){
    locationState[id]="GPS needs HTTPS or localhost. Use START_SERVER.bat, then OPEN_ADMIN.bat.";
    render();
    if(!silent) alert(locationState[id]);
    return false;
  }
  if(!navigator.geolocation){
    locationState[id]="GPS is not supported by this browser.";
    render();
    if(!silent) alert(locationState[id]);
    return false;
  }
  if(watchers[id] || gpsTimers[id]){
    locationState[id]="Live location is sharing.";
    render();
    return true;
  }
  locationState[id]="Requesting GPS permission…";
  render();

  let firstFixHandled=false;
  const success=async p=>{
    const saved=await saveProviderLocation(id,p);
    if(saved && !firstFixHandled){
      firstFixHandled=true;
      if(!silent) alert("Live location is sharing. Keep this dashboard open while travelling.");
    }
  };
  const failure=e=>{
    const msg=e && e.code===1 ? "GPS permission denied. Allow Location for this site." : e && e.code===2 ? "GPS location unavailable. Turn on phone/Windows Location Services and keep Wi‑Fi/mobile data on." : "GPS timed out. Keep Location/Wi‑Fi on and try again.";
    locationState[id]=msg;
    stopLocation(id,false);
    render();
    if(!silent) alert(msg);
  };

  // Use both watchPosition and periodic fresh fixes. Some mobile browsers can
  // delay watch callbacks; the periodic request keeps the provider position
  // moving in Supabase while the dashboard remains open.
  navigator.geolocation.getCurrentPosition(success,failure,{enableHighAccuracy:true,maximumAge:0,timeout:30000});
  watchers[id]=navigator.geolocation.watchPosition(success,failure,{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  gpsTimers[id]=setInterval(()=>{
    if(document.hidden) return;
    navigator.geolocation.getCurrentPosition(success,failure,{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  },4000);
  return true;
}
document.addEventListener("visibilitychange",()=>{
  if(document.hidden) return;
  Object.keys(watchers).forEach(id=>{
    navigator.geolocation.getCurrentPosition(p=>saveProviderLocation(id,p),()=>{}, {enableHighAccuracy:true,maximumAge:0,timeout:15000});
  });
});
async function logout(){
  Object.keys(watchers).forEach(stopLocation);
  watchers={};
  gpsTimers={};
  locationState={};
  await sb.auth.signOut();
}
window.addEventListener("beforeunload",()=>Object.keys(watchers).forEach(stopLocation));
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function escAttr(s){return String(s??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
init();
