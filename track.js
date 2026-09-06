const C=window.THERAPY_CONFIG || window.RELAXGO_CONFIG || {};
const sb=(typeof window.supabase!=="undefined" && typeof C.SUPABASE_URL==="string" && C.SUPABASE_URL.startsWith("http") && typeof C.SUPABASE_ANON_KEY==="string" && (C.SUPABASE_ANON_KEY.startsWith("ey") || C.SUPABASE_ANON_KEY.startsWith("sb_")))?window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY):null;

let map,customerMarker,providerMarker,pollTimer,currentId;

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
function clearMap(){
  if(map){map.remove();map=null;}
  customerMarker=null;
  providerMarker=null;
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
      setTrackMessage("Tracking database setup is incomplete. Please refresh the page and try again.","error");
      showStatus("Tracking setup incomplete","error");
    }else{
      setTrackMessage("Tracking error: "+detail+". Please refresh and try again.","error");
      showStatus("Tracking unavailable","error");
    }
    return;
  }
  if(!Array.isArray(data) || !data.length){
    setTrackMessage("Booking not found. Check the TOW booking ID and try again.","error");
    document.getElementById("statusCard").classList.add("hidden");
    clearMap();
    return;
  }
  const b=data[0];
  const displayId=b.booking_code||id;
  document.getElementById("bookingId").value=displayId;
  render(b,displayId);
  pollTimer=setTimeout(()=>load(currentId),5000);
}
function render(b,displayId){
  const hasCustomer=Number.isFinite(Number(b.customer_lat)) && Number.isFinite(Number(b.customer_lng));
  const hasProvider=Number.isFinite(Number(b.provider_lat)) && Number.isFinite(Number(b.provider_lng));

  setTrackMessage(
    hasProvider
      ? `${b.service} • ${b.booking_date} • ${b.booking_time} — provider location is live`
      : `${b.service} • ${b.booking_date} • ${b.booking_time} — waiting for provider location`,
    hasProvider?"ok":"normal"
  );
  showStatus(`Status: ${b.status||"New"} • Booking ${displayId}`,hasProvider?"ok":"normal");

  if(typeof L==="undefined"){
    setTrackMessage("The map library could not load. Check your internet connection and refresh the page.","error");
    return;
  }
  if(!hasCustomer && !hasProvider){
    clearMap();
    return;
  }

  if(!map){
    map=L.map("map",{zoomControl:true,scrollWheelZoom:false});
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19,
      attribution:"© OpenStreetMap contributors"
    }).addTo(map);
  }

  if(hasCustomer){
    const customer=[Number(b.customer_lat),Number(b.customer_lng)];
    if(!customerMarker){
      customerMarker=L.circleMarker(customer,{radius:9}).addTo(map).bindPopup("Customer location");
    }else{
      customerMarker.setLatLng(customer);
    }
  }

  if(hasProvider){
    const provider=[Number(b.provider_lat),Number(b.provider_lng)];
    if(!providerMarker){
      providerMarker=L.marker(provider).addTo(map).bindPopup("Provider location");
    }else{
      providerMarker.setLatLng(provider);
    }
  }else if(providerMarker){
    providerMarker.remove();
    providerMarker=null;
  }

  const points=[];
  if(customerMarker)points.push(customerMarker.getLatLng());
  if(providerMarker)points.push(providerMarker.getLatLng());
  if(points.length===1){
    map.setView(points[0],15);
  }else if(points.length>1){
    map.fitBounds(L.latLngBounds(points),{padding:[35,35],maxZoom:15});
  }
  setTimeout(()=>map.invalidateSize(),100);
}
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}

const q=new URLSearchParams(location.search).get("id");
if(q){document.getElementById("bookingId").value=q;startTracking()}
