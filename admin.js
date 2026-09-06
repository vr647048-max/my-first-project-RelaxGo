const C=window.THERAPY_CONFIG||window.RELAXGO_CONFIG||{};
const sb=(typeof window.supabase!=="undefined"&&C.SUPABASE_URL&&C.SUPABASE_ANON_KEY)?window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY):null;

let bookings=[],currentUser=null,currentProvider=null,isAdmin=false,realtimeChannel=null;
const watches=new Map(),gpsTimers=new Map(),locationBusy=new Set();
let chatBookingId=null,chatChannel=null;

const nextStatus={New:"Accepted",Accepted:"On the Way","On the Way":"Arrived",Arrived:"Completed"};

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function showLogin(msg=""){ $("loginPanel")?.classList.remove("hidden"); $("dashboardPanel")?.classList.add("hidden"); if($("loginMsg"))$("loginMsg").textContent=msg; }
function normalizedStatus(status){
 const s=String(status||"").trim().toLowerCase();
 if(!s||s==="pending"||s==="new")return"New";
 if(s==="accepted")return"Accepted";
 if(["rejected","declined","cancelled","canceled"].includes(s))return"Rejected";
 if(["on the way","on_way","on-the-way","on the way."].includes(s))return"On the Way";
 if(s==="arrived")return"Arrived";
 if(["completed","complete"].includes(s))return"Completed";
 return String(status).trim()||"New";
}
async function resolveRole(session){
 currentUser=session?.user||null; currentProvider=null;
 isAdmin=!!currentUser&&String(currentUser.id)===String(C.ADMIN_USER_ID||"");
 if(isAdmin)return true;
 if(!currentUser)return false;
 const {data,error}=await sb.from("providers").select("id,user_id,name,is_available").eq("user_id",currentUser.id).maybeSingle();
 if(error){console.error(error);return false;}
 currentProvider=data||null; return !!currentProvider;
}
async function init(){
 if(!sb){showLogin("Supabase is not configured. Check config.js.");return;}
 const {data:{session}}=await sb.auth.getSession();
 if(session)await showDash(session);else showLogin();
 sb.auth.onAuthStateChange(async(_e,s)=>s?await showDash(s):showLogin());
}
async function showDash(session){
 if(!await resolveRole(session)){await sb.auth.signOut();showLogin("This account is not authorized for the Provider Dashboard.");return;}
 $("loginPanel")?.classList.add("hidden"); $("dashboardPanel")?.classList.remove("hidden");
 await load();
 if(realtimeChannel)await sb.removeChannel(realtimeChannel);
 realtimeChannel=sb.channel("tow-bookings-live").on("postgres_changes",{event:"*",schema:"public",table:"bookings"},()=>load()).subscribe();
}
$("loginForm")?.addEventListener("submit",async e=>{
 e.preventDefault();
 const email=$("email")?.value.trim(),password=$("password")?.value;
 const {error}=await sb.auth.signInWithPassword({email,password});
 if(error&&$("loginMsg"))$("loginMsg").textContent=error.message;
});

async function load(){
 const {data,error}=await sb.from("bookings").select("*").order("created_at",{ascending:false});
 if(error){$("bookingList").innerHTML='<div class="empty"><h2>Could not load bookings</h2><p>'+esc(error.message)+'</p></div>';return;}
 bookings=data||[]; render();
}
function render(){
 const counts={New:0,"On the Way":0,Completed:0};
 bookings.forEach(b=>{const s=normalizedStatus(b.status);counts[s]=(counts[s]||0)+1;});
 $("stats").innerHTML='<div class="stat"><b>'+bookings.length+'</b><span>Total</span></div><div class="stat"><b>'+(counts.New||0)+'</b><span>New</span></div><div class="stat"><b>'+(counts["On the Way"]||0)+'</b><span>On the way</span></div><div class="stat"><b>'+(counts.Completed||0)+'</b><span>Completed</span></div>';
 const sf=$("statusFilter")?.value||"all",pf=$("paymentFilter")?.value||"all";
 const visible=bookings.filter(b=>(sf==="all"||normalizedStatus(b.status)===sf)&&(pf==="all"||String(b.payment_status||"unpaid").toLowerCase()===pf));
 $("bookingList").innerHTML=visible.length?visible.map(card).join(""):'<div class="empty"><h2>No matching bookings</h2><p>Try another filter.</p></div>';
}
function card(b){
 const current=normalizedStatus(b.status),next=nextStatus[current]||"",id=String(b.id),code=String(b.booking_code||b.id);
 const phone=String(b.customer_phone||"").replace(/\D/g,"").slice(-10);
 const pay=String(b.payment_status||"unpaid").toLowerCase();
 const payLabel=pay==="paid"?"✅ Paid":pay==="failed"?"❌ Failed":pay==="refunded"?"↩ Refunded":"⏳ Unpaid";
 const nav=b.customer_lat!=null&&b.customer_lng!=null?'<a class="map" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(b.customer_lat+","+b.customer_lng)+'">📍 Navigate</a>':"";
 const wa=phone?'<a class="wa" target="_blank" rel="noopener" href="https://wa.me/91'+phone+'?text='+encodeURIComponent("TherapyOnWay "+code+": provider update — "+(next||current))+'">WhatsApp</a>':"";
 const call=b.customer_phone?'<a class="secondary" href="tel:'+esc(b.customer_phone)+'">☎ Call</a>':"";
 const statusBtn=next?'<button class="accept" data-action="status" data-id="'+esc(id)+'" data-status="'+esc(next)+'">'+(next==="On the Way"?"🚗 On the Way":next==="Arrived"?"📍 Arrived":next==="Completed"?"✓ Complete":"✓ "+esc(next))+'</button>':"";
 const gpsBtn=["Accepted","On the Way","Arrived"].includes(current)?'<button class="map" data-action="gps" data-id="'+esc(id)+'">📡 '+(watches.has(id)?"Sharing Live Location":"Share Live Location")+'</button>':"";
 const chat='<button class="secondary" data-action="chat" data-id="'+esc(id)+'">💬 Chat with Customer</button>';
 return '<article class="booking"><div class="booking-top"><div><div class="booking-id">'+esc(code)+'</div><h2>'+esc(b.customer_name)+'</h2><div>'+esc(b.service)+' • ₹'+Number(b.price||0).toLocaleString("en-IN")+' • '+(String(b.payment_method||"online")==="cash"?"💵 Cash":"💳 Online")+' • '+payLabel+'</div></div><span class="status">'+esc(current)+'</span></div><div class="booking-info"><div class="info"><small>Appointment</small>'+esc(b.booking_date)+' • '+esc(b.booking_time)+'</div><div class="info"><small>Phone</small>'+esc(b.customer_phone)+'</div><div class="info"><small>Customer GPS</small>'+(b.customer_lat!=null&&b.customer_lng!=null?Number(b.customer_lat).toFixed(6)+", "+Number(b.customer_lng).toFixed(6):"Unavailable")+'</div></div><div class="booking-actions">'+nav+wa+call+statusBtn+gpsBtn+chat+'</div></article>';
}

async function setStatus(id,status){
 const target=bookings.find(b=>String(b.id)===String(id));
 if(!target){alert("Booking not found. Refresh the dashboard.");return;}
 const buttons=[...document.querySelectorAll('[data-action="status"][data-id="'+CSS.escape(String(id))+'"]')];
 buttons.forEach(x=>x.disabled=true);
 const patch={status};
 if(!isAdmin&&currentProvider&& !target.provider_id)patch.provider_id=currentProvider.id;
 const {error}=await sb.from("bookings").update(patch).eq("id",id);
 if(error){buttons.forEach(x=>x.disabled=false);alert("Could not update booking: "+error.message);return;}
 await load();
 if(status==="On the Way"||status==="Arrived") startGPS(id,true);
 if(status==="Completed") stopGPS(id);
}

function gpsError(e){
 if(e?.code===1)return"Location permission denied. Open site settings → Location → Allow.";
 if(e?.code===2)return"Location unavailable. Turn on phone Location Services and Wi‑Fi/mobile data.";
 if(e?.code===3)return"GPS timed out. Keep Location Services on and try again.";
 return"Could not read GPS location.";
}
async function publishGPS(id,p){
 if(locationBusy.has(id))return;
 const lat=Number(p?.coords?.latitude),lng=Number(p?.coords?.longitude);
 if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
 locationBusy.add(id);
 try{
  const {data,error}=await sb.rpc("share_provider_location",{p_booking_id:id,p_lat:lat,p_lng:lng});
  if(error)throw error;
  if(!data?.ok)throw new Error("Server rejected the location.");
  setGpsState(id,"📡 Live location sharing • "+lat.toFixed(6)+", "+lng.toFixed(6),true);
 }catch(e){console.error(e);setGpsState(id,"GPS read, but save failed: "+(e.message||e),false);}
 finally{locationBusy.delete(id);}
}
function setGpsState(id,msg,ok){
 const btn=[...document.querySelectorAll('[data-action="gps"][data-id="'+CSS.escape(String(id))+'"]')][0];
 const card=btn?.closest(".booking"); if(!card)return;
 let el=card.querySelector(".location-state");
 if(!el){el=document.createElement("div");el.className="location-state";card.querySelector(".booking-actions")?.appendChild(el);}
 el.textContent=msg;el.style.color=ok?"#138a5b":"";
 if(btn)btn.textContent=ok?"📡 Sharing Live Location":"📡 Share Live Location";
}
async function startGPS(id,silent=false){
 if(!window.isSecureContext&&location.hostname!=="localhost"&&location.hostname!=="127.0.0.1"){setGpsState(id,"GPS requires the HTTPS TherapyOnWay site.",false);if(!silent)alert("Please use the HTTPS Provider Dashboard.");return false;}
 if(!navigator.geolocation){setGpsState(id,"GPS is not supported by this browser.",false);return false;}
 if(watches.has(id)||gpsTimers.has(id)){setGpsState(id,"📡 Live location sharing.",true);return true;}
 setGpsState(id,"Requesting GPS permission…",false);
 try{
  await sb.auth.getUser();
  const success=p=>publishGPS(id,p);
  const failure=e=>{setGpsState(id,gpsError(e),false);if(e?.code===1)stopGPS(id);};
  navigator.geolocation.getCurrentPosition(success,failure,{enableHighAccuracy:true,maximumAge:0,timeout:30000});
  const w=navigator.geolocation.watchPosition(success,failure,{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  watches.set(id,w);
  gpsTimers.set(id,setInterval(()=>{if(!document.hidden)navigator.geolocation.getCurrentPosition(success,()=>{},{enableHighAccuracy:true,maximumAge:0,timeout:15000});},5000));
  return true;
 }catch(e){setGpsState(id,e.message||"GPS could not start.",false);return false;}
}
function stopGPS(id){
 const w=watches.get(id);if(w!=null){navigator.geolocation.clearWatch(w);watches.delete(id);}
 const t=gpsTimers.get(id);if(t){clearInterval(t);gpsTimers.delete(id);}
}

document.addEventListener("visibilitychange",()=>{if(document.hidden)return;for(const id of watches.keys())navigator.geolocation.getCurrentPosition(p=>publishGPS(id,p),()=>{},{enableHighAccuracy:true,maximumAge:0,timeout:15000});});

$("bookingList")?.addEventListener("click",async e=>{
 const btn=e.target.closest("button[data-action]");if(!btn)return;
 const id=btn.dataset.id,action=btn.dataset.action;
 if(action==="status"){await setStatus(id,btn.dataset.status);}
 if(action==="gps"){if(watches.has(id))setGpsState(id,"📡 Live location sharing.",true);else await startGPS(id,false);}
 if(action==="chat")await openChat(id);
});

async function openChat(id){
 chatBookingId=String(id);const b=bookings.find(x=>String(x.id)===chatBookingId);
 const panel=$("chatPanel");if(!panel){alert("Chat panel is missing.");return;}
 panel.classList.remove("hidden");$("chatTitle").textContent="💬 Customer Chat • "+(b?.customer_name||"Customer");
 await loadChat();
 if(chatChannel)await sb.removeChannel(chatChannel);
 chatChannel=sb.channel("tow-chat-"+chatBookingId).on("postgres_changes",{event:"INSERT",schema:"public",table:"booking_messages",filter:"booking_id=eq."+chatBookingId},payload=>{const box=$("chatMessages");if(box){box.insertAdjacentHTML("beforeend",chatHtml(payload.new));box.scrollTop=box.scrollHeight;}}).subscribe();
}
function chatHtml(m){const who=m.sender_role==="customer"?"Customer":"You";return'<div class="chat-msg '+(m.sender_role==="customer"?"customer":"provider")+'"><b>'+esc(who)+'</b><div>'+esc(m.message)+'</div><small>'+new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})+'</small></div>';}
async function loadChat(){
 if(!chatBookingId)return;const box=$("chatMessages");if(!box)return;
 const {data,error}=await sb.from("booking_messages").select("id,sender_role,message,created_at").eq("booking_id",chatBookingId).order("created_at",{ascending:true});
 box.innerHTML=error?'<div class="empty">Chat unavailable: '+esc(error.message)+'</div>':((data||[]).map(chatHtml).join("")||'<div class="empty">No messages yet. Send a message to the customer.</div>');
 box.scrollTop=box.scrollHeight;
}
function closeChat(){if(chatChannel)sb.removeChannel(chatChannel);chatChannel=null;chatBookingId=null;$("chatPanel")?.classList.add("hidden");}
$("chatForm")?.addEventListener("submit",async e=>{
 e.preventDefault();if(!chatBookingId||!currentUser)return;
 const input=$("chatInput"),message=input.value.trim();if(!message)return;
 const {error}=await sb.from("booking_messages").insert({booking_id:chatBookingId,sender_role:isAdmin?"admin":"provider",sender_user_id:currentUser.id,message});
 if(error){alert("Message could not be sent: "+error.message);return;}input.value="";await loadChat();
});
window.closeChat=closeChat;
window.logout=async()=>{for(const id of watches.keys())stopGPS(id);if(chatChannel)await sb.removeChannel(chatChannel);await sb.auth.signOut();};
init();