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


async function loadRazorpay(){
  if (window.Razorpay) return true;
  await new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = "https://checkout.razorpay.com/v1/checkout.js";
    sc.onload = resolve;
    sc.onerror = reject;
    document.head.appendChild(sc);
  });
  return !!window.Razorpay;
}

async function paymentApi(payload){
  const endpoint = String(C.PAYMENT_FUNCTION_URL || (String(C.SUPABASE_URL || "").replace(/\/$/, "") + "/functions/v1/razorpay-payment"));
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": C.SUPABASE_ANON_KEY, "Authorization": "Bearer " + C.SUPABASE_ANON_KEY },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Payment service unavailable.");
  return data;
}

const bookingForm = document.getElementById("bookingForm");
if (bookingForm) {
  const paymentRadios = [...bookingForm.querySelectorAll('input[name="payment_method"]')];
  const submitButton = bookingForm.querySelector('#bookingSubmit') || bookingForm.querySelector('button[type="submit"]');
  function selectedPaymentMethod(){ return (paymentRadios.find(r=>r.checked)?.value || 'online'); }
  function updatePaymentButton(){
    if (!submitButton || bookingSubmitting) return;
    submitButton.textContent = selectedPaymentMethod()==='cash' ? 'Confirm Cash Booking' : 'Pay & Confirm Booking';
  }
  paymentRadios.forEach(r=>r.addEventListener('change',updatePaymentButton));

  bookingForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (bookingSubmitting) return;
    if (!coords) { alert("Please click “Use my location” and wait until GPS says Location captured."); return; }
    if (!sb) { alert("Supabase SDK/config is not loaded. Please refresh once."); return; }

    bookingSubmitting = true;
    const paymentMethod = selectedPaymentMethod();
    const reset = () => { bookingSubmitting=false; if(submitButton){submitButton.disabled=false;updatePaymentButton();} };
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = paymentMethod==='cash' ? "Creating cash booking…" : "Preparing secure payment…"; }

    try {
      const serviceValue = document.getElementById("service").value;
      if (!serviceValue) throw new Error("Please select a service.");
      const [service, priceText] = serviceValue.split("|");
      const price = Number(priceText);
      const phone = document.getElementById("phone").value.trim();
      if (!/^[0-9]{10}$/.test(phone)) throw new Error("Please enter a valid 10-digit mobile number.");
      const dateValue = document.getElementById("date").value;
      const timeValue = document.getElementById("time").value;
      const appointment = new Date(`${dateValue}T${timeValue}`);
      if (!dateValue || !timeValue || Number.isNaN(appointment.getTime()) || appointment.getTime() < Date.now() + 5 * 60 * 1000) throw new Error("Please choose a future date and time (at least 5 minutes from now).");

      const booking = {
        customer_name: document.getElementById("name").value.trim(),
        customer_phone: phone,
        service, price,
        booking_date: dateValue,
        booking_time: timeValue,
        customer_lat: coords.lat,
        customer_lng: coords.lng,
        customer_accuracy: coords.accuracy
      };

      if (paymentMethod === 'cash') {
        const created = await paymentApi({action:'create_cash_booking', booking});
        const saved = created.booking;
        const trackingId = saved.booking_code;
        bookingForm.classList.add("hidden");
        const s = document.getElementById("bookingSuccess");
        s.classList.remove("hidden");
        const safe = value => String(value).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
        const wa = "https://wa.me/" + String(C.BUSINESS_WHATSAPP || C.BUSINESS_PHONE || "").replace(/\D/g,"") + "?text=" + encodeURIComponent(`New TherapyOnWay Cash Booking\n\nID: ${trackingId}\nName: ${saved.customer_name}\nService: ${saved.service}\nAmount: ₹${saved.price}\nDate: ${saved.booking_date}\nTime: ${saved.booking_time}\nLocation: https://www.google.com/maps?q=${saved.customer_lat},${saved.customer_lng}`);
        s.innerHTML = `<h3>✅ Cash booking confirmed</h3><p>Your Booking ID</p><code>${safe(trackingId)}</code><p>Amount due on service: ₹${safe(saved.price)}. Please pay the provider after the session.</p><a class="btn primary full" href="track.html?id=${encodeURIComponent(trackingId)}">Track Booking</a><a class="btn secondary full" style="margin-top:8px" target="_blank" rel="noopener" href="${wa}">Send booking details on WhatsApp</a>`;
        return;
      }

      const order = await paymentApi({ action: "create_order", service, price });
      await loadRazorpay();
      if (!window.Razorpay) throw new Error("Razorpay Checkout could not be loaded. Please check your internet connection.");
      if (submitButton) submitButton.textContent = "Waiting for payment…";

      const result = await new Promise((resolve, reject) => {
        const rz = new Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: order.currency || "INR",
          name: C.BRAND_NAME || "TherapyOnWay",
          description: service,
          order_id: order.order_id,
          prefill: { name: booking.customer_name, contact: "+91" + booking.customer_phone },
          notes: { booking_service: service },
          theme: { color: "#19a974" },
          handler: response => resolve(response),
          modal: { ondismiss: () => reject(new Error("Payment window was closed. Your booking was not created.")) }
        });
        rz.on("payment.failed", response => reject(new Error(response?.error?.description || "Payment failed. No booking was created.")));
        rz.open();
      });

      if (submitButton) submitButton.textContent = "Verifying payment…";
      const verified = await paymentApi({action:"verify_payment",razorpay_order_id:result.razorpay_order_id,razorpay_payment_id:result.razorpay_payment_id,razorpay_signature:result.razorpay_signature,booking});
      const saved = verified.booking;
      const trackingId = saved.booking_code;
      bookingForm.classList.add("hidden");
      const s = document.getElementById("bookingSuccess");
      s.classList.remove("hidden");
      const maskingWhatsApp = String(C.MASKING_WHATSAPP_URL || ("https://wa.me/" + String(C.BUSINESS_WHATSAPP || "").replace(/\D/g,""))).trim();
      const wa = maskingWhatsApp ? maskingWhatsApp + (maskingWhatsApp.includes("?") ? "&" : "?") + "text=" + encodeURIComponent(`New TherapyOnWay Paid Booking\n\nID: ${trackingId}\nName: ${saved.customer_name}\nService: ${saved.service}\nAmount: ₹${saved.price}\nDate: ${saved.booking_date}\nTime: ${saved.booking_time}\nLocation: https://www.google.com/maps?q=${saved.customer_lat},${saved.customer_lng}\nPayment ID: ${result.razorpay_payment_id}`) : "#";
      const safe = value => String(value).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
      s.innerHTML = `<h3>✅ Payment successful & booking confirmed</h3><p>Your Booking ID</p><code>${safe(trackingId)}</code><p>Paid securely: ₹${safe(saved.price)}. Save this ID to track your booking.</p><a class="btn primary full" href="track.html?id=${encodeURIComponent(trackingId)}">Track Booking</a><a class="btn secondary full" style="margin-top:8px" target="_blank" rel="noopener" href="${wa}">Send booking details on WhatsApp</a>`;
    } catch (err) {
      alert(err?.message || "Booking could not be completed.");
      reset();
    }
  });
  updatePaymentButton();
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

// Direct contact mode: the current business number is restored so Call and
// WhatsApp work immediately. A masked/virtual destination can replace these
// values later without changing the customer booking flow.
const businessPhone = String(C.BUSINESS_PHONE || "").replace(/\D/g,"");
const businessDisplay = String(C.BUSINESS_PHONE_DISPLAY || "+91 724 846 3222");
const businessWhatsApp = String(C.BUSINESS_WHATSAPP || businessPhone).replace(/\D/g,"");

function setContactLink(el, href, text){
  if (!el) return;
  el.href = href;
  el.textContent = text;
  el.removeAttribute("aria-disabled");
  el.classList.remove("disabled");
}
if (businessPhone.length >= 10) {
  setContactLink(callTop, "tel:+" + businessPhone, "☎ Call / WhatsApp");
  setContactLink(callHero, "tel:+" + businessPhone, "☎ Call for Booking");
  setContactLink(footerPhone, "tel:+" + businessPhone, "☎ " + businessDisplay);
}
if (businessWhatsApp.length >= 10) {
  const waHref = "https://wa.me/" + businessWhatsApp + "?text=" +
    encodeURIComponent("Hello TherapyOnWay, I want to book a massage.");
  setContactLink(footerWhatsApp, waHref, "WhatsApp Support");
  footerWhatsApp.target = "_blank";
  footerWhatsApp.rel = "noopener";
}

