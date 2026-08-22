const C=window.THERAPY_CONFIG || window.RELAXGO_CONFIG || {};
const sb=(typeof window.supabase!=="undefined" && typeof C.SUPABASE_URL==="string" && C.SUPABASE_URL.startsWith("http") && typeof C.SUPABASE_ANON_KEY==="string" && (C.SUPABASE_ANON_KEY.startsWith("ey") || C.SUPABASE_ANON_KEY.startsWith("sb_")))?window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY):null;
let map,providerMarker,pollTimer,currentId,lastProviderLat,lastProviderLng;

function setTrackMessage(text,kind="normal"){
  const el=document.getElementById("trackText");
  if(!el)return;
  el.textContent=text;
  el.className=kind==="error"?"track-error":kind==="ok"?"track-ok":"";
}
function showStatus(text,kind="normal"){
  const c=document.getElementById("statusCard");
  if(!c)return;
  c.classList.remove("hidden");
  c.innerHTML=`<b>${esc(text)}</b>`;
  c.dataset.kind=kind;
}

function startTracking(){
  const id=document.getElementById("bookingId").value.trim();
  if(!id)return;
  if(!sb){
    setTrackMessage("Supabase is not connected. Check config.js and refresh the page.","error");
    showStatus("Tracking setup incomplete","error");
    return;
  }
  currentId=id.toUpperCase();
  load(currentId);
}

async function load(id){
  clearTimeout(pollTimer);
  const {data,error}=await sb.rpc("get_booking_tracking",{p_booking_id:id});
  if(error){
    console.error("get_booking_tracking error:",error);
    const detail=String(error.message||"");
    if(/function .*get_booking_tracking.*does not exist|schema cache|not found|404/i.test(detail)){
      setTrackMessage("Tracking database setup is incomplete. Open Supabase → SQL Editor and run the complete schema.sql from this folder, then refresh.","error");
      showStatus("Run schema.sql in Supabase", "error");
    }else{
      setTrackMessage("Tracking is temporarily unavailable. Please check the Supabase connection and try again.","error");
      showStatus("Tracking unavailable","error");
    }
    pollTimer=setTimeout(()=>load(currentId),3000);
    return;
  }
  if(!Array.isArray(data) || !data.length){
    setTrackMessage("Booking not found. Check the TOW booking ID and try again.","error");
    document.getElementById("statusCard").classList.add("hidden");
    if(map){map.remove();map=null;providerMarker=null;}
    pollTimer=setTimeout(()=>load(currentId),3000);
    return;
  }
  const b=data[0];
  const displayId=b.booking_code||id;
  document.getElementById("bookingId").value=displayId;
  render(b,displayId);
  // Refresh frequently enough to make walking/driving movement visible.
  pollTimer=setTimeout(()=>load(currentId),2000);
}

function render(b,displayId){
  const waiting=b.provider_lat==null || b.provider_lng==null;
  setTrackMessage(
    waiting
      ? `${b.service} • ${b.booking_date} • ${b.booking_time} — waiting for provider location`
      : `${b.service} • ${b.booking_date} • ${b.booking_time} — provider location is live`,
    waiting?"normal":"ok"
  );
  showStatus(`Status: ${b.status||"New"} • Booking ${displayId}`,waiting?"normal":"ok");

  if(waiting){
    if(map){map.remove();map=null;providerMarker=null;}
    lastProviderLat=undefined;
    lastProviderLng=undefined;
    return;
  }
  if(typeof L === "undefined"){
    setTrackMessage("Provider location is available, but the map service could not load. Refresh the page to try again.","error");
    return;
  }
  const lat=Number(b.provider_lat);
  const lng=Number(b.provider_lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
  if(!map){
    map=L.map("map").setView([lat,lng],15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap contributors"}).addTo(map);
  }
  if(!providerMarker){
    providerMarker=L.marker([lat,lng]).addTo(map).bindPopup("Provider");
  }else{
    const oldLat=lastProviderLat??providerMarker.getLatLng().lat;
    const oldLng=lastProviderLng??providerMarker.getLatLng().lng;
    providerMarker.setLatLng([lat,lng]);
    // Only recenter when the provider actually moved, so the map does not
    // constantly fight the customer's manual pan/zoom.
    if(Math.abs(lat-oldLat)>0.000001 || Math.abs(lng-oldLng)>0.000001){
      map.panTo([lat,lng],{animate:true,duration:0.4});
    }
  }
  lastProviderLat=lat;
  lastProviderLng=lng;
  setTimeout(()=>map.invalidateSize(),50);
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

const q=new URLSearchParams(location.search).get("id");
if(q){document.getElementById("bookingId").value=q;startTracking()}
