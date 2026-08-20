const C = window.THERAPY_CONFIG || window.RELAXGO_CONFIG || {};
const sb = (typeof window.supabase !== "undefined" &&
  typeof C.SUPABASE_URL === "string" && C.SUPABASE_URL.startsWith("http") &&
  typeof C.SUPABASE_ANON_KEY === "string" &&
  (C.SUPABASE_ANON_KEY.startsWith("ey") || C.SUPABASE_ANON_KEY.startsWith("sb_")))
  ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;

let coords = null;
let locationBusy = false;
let bookingSubmitting = false;

function openBooking(){
  const modal = document.getElementById("bookingModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60);
  const date = document.getElementById("date");
  const time = document.getElementById("time");
  const localDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  if (date) {
    const today = new Date();
    date.min = today.toLocaleDateString("en-CA");
    date.value = localDate.toLocaleDateString("en-CA");
  }
  if (time) time.value = d.toTimeString().slice(0,5);
}

function closeBooking(){
  const modal = document.getElementById("bookingModal");
  if (modal) modal.classList.add("hidden");
}

function selectService(n){
  openBooking();
  const el = document.getElementById("service");
  if (!el) return;
  [...el.options].forEach(o => { o.selected = o.value.startsWith(n + "|"); });
}

function setLocationStatus(text, ok=false){
  const s = document.getElementById("locationStatus");
  if (s) {
    s.textContent = text;
    s.style.color = ok ? "#138a5b" : "";
  }
}

function getLocation(){
  if (locationBusy) return;
  locationBusy = true;
  const input = document.getElementById("locationText");
  if (input) input.value = "";
  setLocationStatus("📍 Getting your location…");

  if (!window.isSecureContext) {
    setLocationStatus("⚠️ GPS needs HTTPS (or localhost).");
    locationBusy = false;
    return;
  }

  if (!navigator.geolocation) {
    setLocationStatus("❌ This browser does not support GPS.");
    locationBusy = false;
    return;
  }

  const success = p => {
    coords = {
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      accuracy: p.coords.accuracy
    };
    if (input) {
      input.value = `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
    }
    setLocationStatus(`✓ Location captured (±${Math.round(coords.accuracy)}m)`, true);
    locationBusy = false;
  };

  const failure = e => {
    let msg = "❌ GPS could not get your location.";
    if (e && e.code === 1) msg = "❌ Location permission was denied. Click the 🔒 icon near the address bar → Location → Allow, then reload.";
    if (e && e.code === 2) msg = "❌ Location unavailable. Turn on Windows Location Services and try again.";
    if (e && e.code === 3) msg = "❌ GPS timed out. Turn on Wi‑Fi/location and try again.";
    setLocationStatus(msg);
    locationBusy = false;
  };

  navigator.geolocation.getCurrentPosition(success, failure, {
    enableHighAccuracy: true,
    timeout: 30000,
    maximumAge: 0
  });
}

function code(){
  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    const a = new Uint32Array(1);
    window.crypto.getRandomValues(a);
    return "TOW-" + String(a[0] % 1000000).padStart(6,"0");
  }
  return "TOW-" + Math.floor(100000 + Math.random()*900000);
}


const bookingForm = document.getElementById("bookingForm");
if (bookingForm) {
  bookingForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (bookingSubmitting) return;
    if (!coords) {
      alert("Please click “Use my location” and wait until GPS says Location captured.");
      return;
    }
    if (!sb) {
      alert("Supabase SDK/config is not loaded. Please refresh once. If it still fails, make sure internet is on so the Supabase SDK can load.");
      return;
    }

    bookingSubmitting = true;
    const submitButton = bookingForm.querySelector('button[type="submit"]');
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = "Saving booking…"; }
    const serviceValue = document.getElementById("service").value;
    if (!serviceValue) { alert("Please select a service."); bookingSubmitting=false; if(submitButton){submitButton.disabled=false;submitButton.textContent="Confirm Booking";} return; }
    const [service, price] = serviceValue.split("|");
    const phone = document.getElementById("phone").value.trim();
    if (!/^[0-9]{10}$/.test(phone)) { alert("Please enter a valid 10-digit mobile number."); bookingSubmitting=false; if(submitButton){submitButton.disabled=false;submitButton.textContent="Confirm Booking";} return; }
    const dateValue = document.getElementById("date").value;
    const timeValue = document.getElementById("time").value;
    const appointment = new Date(`${dateValue}T${timeValue}`);
    if (!dateValue || !timeValue || Number.isNaN(appointment.getTime()) || appointment.getTime() < Date.now() + 5 * 60 * 1000) {
      alert("Please choose a future date and time (at least 5 minutes from now).");
      bookingSubmitting=false; if(submitButton){submitButton.disabled=false;submitButton.textContent="Confirm Booking";}
      return;
    }
    const bookingCode = code();
    const b = {
      booking_code: bookingCode,
      customer_name: document.getElementById("name").value.trim(),
      customer_phone: phone,
      service,
      price: Number(price),
      booking_date: document.getElementById("date").value,
      booking_time: document.getElementById("time").value,
      customer_lat: coords.lat,
      customer_lng: coords.lng,
      customer_accuracy: coords.accuracy
    };

    // The database schema is intentionally kept in one place (schema.sql).
    // Insert the complete booking record, including GPS accuracy, so the
    // customer, provider dashboard and tracking page all use the same shape.
    let inserted = null;
    let error = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      b.booking_code = attempt === 0 ? bookingCode : code();
      ({error} = await sb.from("bookings").insert(b));

      // A rare duplicate code should never make a real booking fail.
      const msg = String(error?.message || "").toLowerCase();
      const duplicate = msg.includes("duplicate") && msg.includes("booking");
      if (!duplicate) break;
    }

    if (error) {
      const msg = String(error.message || "");
      if (msg.toLowerCase().includes("schema cache") || msg.toLowerCase().includes("column")) {
        alert("Booking could not be saved because Supabase is still using an old table schema. Run the included schema.sql once in Supabase SQL Editor, then refresh this page.");
      } else {
        alert("Booking could not be saved: " + msg);
      }
      bookingSubmitting=false; if(submitButton){submitButton.disabled=false;submitButton.textContent="Confirm Booking";}
      return;
    }

    const trackingId = b.booking_code;
    if (!trackingId) { alert("Booking was saved but no tracking ID was returned. Please contact support."); bookingSubmitting=false; if(submitButton){submitButton.disabled=false;submitButton.textContent="Confirm Booking";} return; }

    bookingForm.classList.add("hidden");
    const s = document.getElementById("bookingSuccess");
    s.classList.remove("hidden");

    const providerPhone = String(C.PROVIDER_PHONE || "").replace(/\D/g,"");
    const wa = `https://wa.me/${providerPhone}?text=${encodeURIComponent(
      `New TherapyOnWay Booking\n\nID: ${trackingId}\nName: ${b.customer_name}\nService: ${b.service}\nDate: ${b.booking_date}\nTime: ${b.booking_time}\nLocation: https://www.google.com/maps?q=${b.customer_lat},${b.customer_lng}`
    )}`;

    const safe = value => String(value).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
    s.innerHTML =
      `<h3>✅ Booking confirmed</h3><p>Your Booking ID</p><code>${safe(trackingId)}</code>` +
      `<p>Save this ID to track your booking.</p>` +
      `<a class="btn primary full" href="track.html?id=${encodeURIComponent(trackingId)}">Track Booking</a>` +
      `<a class="btn secondary full" style="margin-top:8px" target="_blank" rel="noopener" href="${wa}">Send provider WhatsApp alert</a>`;
  });
}

function goTrack(){
  const el = document.getElementById("trackId");
  const id = el ? el.value.trim().toUpperCase() : "";
  if (id) location.href = "track.html?id=" + encodeURIComponent(id);
}

const callTop = document.getElementById("callTop");
const callHero = document.getElementById("callHero");
const footerPhone = document.getElementById("footerPhone");
const footerWhatsApp = document.getElementById("footerWhatsApp");
const providerDigits = String(C.PROVIDER_PHONE || "").replace(/\D/g,"").slice(-10);
const providerIntl = providerDigits ? "+91" + providerDigits : "";
if (callTop) callTop.href = providerDigits ? "tel:" + providerIntl : "#";
if (callHero) callHero.href = providerDigits ? "tel:" + providerIntl : "#";
if (footerPhone) {
  footerPhone.href = providerDigits ? "tel:" + providerIntl : "#";
  footerPhone.textContent = providerDigits ? "☎ +91 " + providerDigits.slice(0,5) + " " + providerDigits.slice(5) : "☎ Contact provider";
}
if (footerWhatsApp) {
  footerWhatsApp.href = providerDigits ? "https://wa.me/" + providerDigits : "#";
  footerWhatsApp.target = "_blank";
  footerWhatsApp.rel = "noopener";
}
