const C=window.THERAPY_CONFIG||window.RELAXGO_CONFIG||{};
const sb=(typeof window.supabase!=="undefined"&&C.SUPABASE_URL&&C.SUPABASE_ANON_KEY)?window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY):null;
let map=null,customerMarker=null,providerMarker=null,pollTimer=null,currentId=null,chatTimer=null,chatReady=false;

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function setTrackMessage(text,kind="normal"){const el=$("trackText");if(el){el.textContent=text;el.className=kind==="error"?"track-error":kind==="ok"?"track-ok":"";}}
function showStatus(text,kind="normal"){const c=$("statusCard");if(!c)return;c.classList.remove("hidden");c.innerHTML="<b>"+esc(text)+"</b>";}
function clearMap(){if(map){map.remove();map=null;}customerMarker=null;providerMarker=null;}
function startTracking(){
 const id=$("bookingId")?.value.trim();if(!id)return;
 if(!sb){setTrackMessage("Tracking is not connected. Please refresh the page.","error");return;}
 currentId=id.toUpperCase();load(currentId);
}
async function load(id){
 clearTimeout(pollTimer);
 const {data,error}=await sb.rpc("get_booking_tracking",{p_booking_id:id});
 if(error){console.error(error);setTrackMessage("Tracking error: "+(error.message||"Please refresh the page."),"error");clearMap();return;}
 if(!Array.isArray(data)||!data.length){setTrackMessage("Booking not found. Check your TOW booking ID.","error");$("statusCard")?.classList.add("hidden");clearMap();$("customerChat")?.classList.add("hidden");return;}
 const b=data[0],displayId=b.booking_code||id;
 $("bookingId").value=displayId;renderMap(b,displayId);prepareChat(displayId);
 pollTimer=setTimeout(()=>load(currentId),4000);
}
function renderMap(b,displayId){
 const hasCustomer=Number.isFinite(Number(b.customer_lat))&&Number.isFinite(Number(b.customer_lng));
 const hasProvider=Number.isFinite(Number(b.provider_lat))&&Number.isFinite(Number(b.provider_lng));
 setTrackMessage(hasProvider
  ? (b.service+" • "+b.booking_date+" • "+b.booking_time+" — provider location is live")
  : (b.service+" • "+b.booking_date+" • "+b.booking_time+" — waiting for provider location"),
  hasProvider?"ok":"normal");
 showStatus("Status: "+(b.status||"New")+" • Booking "+displayId,hasProvider?"ok":"normal");
 if(typeof L==="undefined"){setTrackMessage("Map library could not load. Check internet and refresh.","error");return;}
 if(!hasCustomer&&!hasProvider){clearMap();return;}
 if(!map){
  map=L.map("map",{zoomControl:true,scrollWheelZoom:false});
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
 }
 if(hasCustomer){
  const p=[Number(b.customer_lat),Number(b.customer_lng)];
  if(!customerMarker)customerMarker=L.circleMarker(p,{radius:9}).addTo(map).bindPopup("Customer location");
  else customerMarker.setLatLng(p);
 }
 if(hasProvider){
  const p=[Number(b.provider_lat),Number(b.provider_lng)];
  if(!providerMarker)providerMarker=L.marker(p).addTo(map).bindPopup("Provider location");
  else providerMarker.setLatLng(p);
 }else if(providerMarker){providerMarker.remove();providerMarker=null;}
 const pts=[];if(customerMarker)pts.push(customerMarker.getLatLng());if(providerMarker)pts.push(providerMarker.getLatLng());
 if(pts.length===1)map.setView(pts[0],15);else if(pts.length>1)map.fitBounds(L.latLngBounds(pts),{padding:[35,35],maxZoom:15});
 setTimeout(()=>map.invalidateSize(),100);
}

function prepareChat(code){
 const panel=$("customerChat");if(!panel)return;
 panel.classList.remove("hidden");
 const saved=localStorage.getItem("tow-chat-phone-"+code)||"";
 if(saved&&$("chatPhone"))$("chatPhone").value=saved;
}
function chatHtml(m){
 const who=m.sender_role==="customer"?"You":"Provider";
 return '<div class="chat-msg '+(m.sender_role==="customer"?"provider":"customer")+'"><b>'+esc(who)+'</b><div>'+esc(m.message)+'</div><small>'+new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})+'</small></div>';
}
async function connectChat(){
 const code=currentId,phone=String($("chatPhone")?.value||"").replace(/\D/g,"");
 if(!/^\d{10}$/.test(phone)){ $("chatAccess").textContent="Please enter the same 10-digit mobile number used for this booking.";return false; }
 $("chatAccess").textContent="Opening chat…";
 const {data,error}=await sb.rpc("get_customer_chat",{p_booking_code:code,p_phone:phone});
 if(error){$("chatAccess").textContent=error.message||"Booking ID and mobile number do not match.";$("customerChatForm")?.classList.add("hidden");chatReady=false;return false;}
 localStorage.setItem("tow-chat-phone-"+code,phone);chatReady=true;
 $("chatAccess").textContent="✓ Chat connected. You can message the provider.";
 const box=$("customerChatBox");box.innerHTML=(data||[]).map(chatHtml).join("")||'<div class="empty">No messages yet. You can send a message now.</div>';
 $("customerChatForm")?.classList.remove("hidden");box.scrollTop=box.scrollHeight;
 clearInterval(chatTimer);chatTimer=setInterval(loadCustomerChat,4000);
 return true;
}
async function loadCustomerChat(){
 if(!chatReady||!currentId)return;
 const phone=String($("chatPhone")?.value||"").replace(/\D/g,"");
 const {data,error}=await sb.rpc("get_customer_chat",{p_booking_code:currentId,p_phone:phone});
 if(error)return;
 const box=$("customerChatBox");if(box){box.innerHTML=(data||[]).map(chatHtml).join("")||'<div class="empty">No messages yet.</div>';box.scrollTop=box.scrollHeight;}
}
$("chatConnect")?.addEventListener("click",e=>{e.preventDefault();connectChat();});
$("customerChatForm")?.addEventListener("submit",async e=>{
 e.preventDefault();if(!chatReady||!currentId)return;
 const input=$("customerChatInput"),message=input.value.trim();if(!message)return;
 const phone=String($("chatPhone")?.value||"").replace(/\D/g,"");
 const btn=e.submitter||e.currentTarget.querySelector("button");if(btn)btn.disabled=true;
 const {error}=await sb.rpc("send_customer_chat",{p_booking_code:currentId,p_phone:phone,p_message:message});
 if(error){alert(error.message||"Message could not be sent.");}
 else{input.value="";await loadCustomerChat();}
 if(btn)btn.disabled=false;
});
const q=new URLSearchParams(location.search).get("id");if(q){$("bookingId").value=q;startTracking();}
window.addEventListener("beforeunload",()=>{clearTimeout(pollTimer);clearInterval(chatTimer);});
