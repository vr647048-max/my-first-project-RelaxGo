// TherapyOnWay live-location hardening.
// Loaded after admin.js so the Share Live Location button always uses this
// HTTPS-safe, RLS-safe location publisher.
(function(){
  const C = window.THERAPY_CONFIG || window.RELAXGO_CONFIG || {};
  const client = (typeof window.supabase !== "undefined" && C.SUPABASE_URL && C.SUPABASE_ANON_KEY)
    ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY)
    : null;

  const watches = Object.create(null);
  const timers = Object.create(null);
  const busy = Object.create(null);
  const lastSaved = Object.create(null);

  function pageIsSecure(){
    return window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  }

  function findButton(id){
    return Array.from(document.querySelectorAll("button.map")).find(b =>
      String(b.getAttribute("onclick") || "").includes(String(id))
    ) || null;
  }

  function setUi(id, text, ok){
    const button = findButton(id);
    if(button){
      button.textContent = ok ? "📡 Sharing Live Location" : "📡 Share Live Location";
    }
    const card = button ? button.closest(".booking") : null;
    if(!card) return;
    let state = card.querySelector(".location-state");
    if(!state){
      state = document.createElement("div");
      state.className = "location-state";
      card.querySelector(".booking-actions")?.appendChild(state);
    }
    state.textContent = text;
    state.style.color = ok ? "#138a5b" : "";
  }

  function stop(id){
    if(watches[id]){
      navigator.geolocation.clearWatch(watches[id]);
      delete watches[id];
    }
    if(timers[id]){
      clearInterval(timers[id]);
      delete timers[id];
    }
    delete busy[id];
  }

  function errorText(e){
    if(e && e.code === 1) return "GPS permission denied. Open the site over HTTPS and allow Location.";
    if(e && e.code === 2) return "GPS is unavailable. Turn on phone Location Services and keep Wi‑Fi/mobile data on.";
    if(e && e.code === 3) return "GPS timed out. Keep Location Services on and try again.";
    return "Could not read GPS location. Please try again.";
  }

  async function publish(id, position){
    if(!client) throw new Error("Supabase connection is not available.");
    const lat = Number(position?.coords?.latitude);
    const lng = Number(position?.coords?.longitude);
    if(!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("GPS returned an invalid location.");

    // Avoid writing identical coordinates repeatedly when the device has not moved.
    const previous = lastSaved[id];
    if(previous && Math.abs(previous.lat-lat) < 0.000001 && Math.abs(previous.lng-lng) < 0.000001){
      setUi(id, "Live location is sharing.", true);
      return;
    }

    const { data, error } = await client.rpc("share_provider_location", {
      p_booking_id: id,
      p_lat: lat,
      p_lng: lng
    });
    if(error) throw error;
    if(!data || data.ok !== true) throw new Error("Supabase did not confirm the location update.");

    lastSaved[id] = {lat,lng};
    setUi(id, `Live location is sharing • ${lat.toFixed(6)}, ${lng.toFixed(6)}`, true);
  }

  function start(id, silent){
    if(!pageIsSecure()){
      setUi(id, "GPS needs the secure HTTPS TherapyOnWay website. Open the Provider Dashboard from OPEN_ADMIN.bat.", false);
      if(!silent) alert("GPS needs HTTPS. I have fixed the dashboard so the normal Provider Dashboard opens on the secure GitHub Pages address.");
      return false;
    }
    if(!navigator.geolocation){
      setUi(id, "This browser does not support GPS.", false);
      if(!silent) alert("This browser does not support GPS.");
      return false;
    }
    if(!client){
      setUi(id, "Supabase connection is not available. Refresh the page.", false);
      return false;
    }
    if(watches[id] || timers[id]){
      setUi(id, "Live location is sharing.", true);
      return true;
    }

    setUi(id, "Requesting GPS permission…", false);

    const success = async position => {
      if(busy[id]) return;
      busy[id] = true;
      try{
        await publish(id, position);
      }catch(err){
        console.error("TherapyOnWay live location update failed", err);
        const message = String(err?.message || err || "Location update failed");
        setUi(id, "GPS captured, but the server could not save it: " + message, false);
        if(!silent && !start._alerted){
          start._alerted = true;
          alert("Live location could not be saved. Please refresh the Provider Dashboard and try again.");
        }
      }finally{
        busy[id] = false;
      }
    };

    const failure = e => {
      console.error("TherapyOnWay geolocation error", e);
      stop(id);
      setUi(id, errorText(e), false);
      if(!silent) alert(errorText(e));
    };

    navigator.geolocation.getCurrentPosition(success, failure, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 30000
    });

    watches[id] = navigator.geolocation.watchPosition(success, failure, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000
    });

    timers[id] = setInterval(() => {
      if(document.hidden) return;
      navigator.geolocation.getCurrentPosition(success, () => {}, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
      });
    }, 5000);

    return true;
  }

  // Override the old dashboard implementation without requiring the user to
  // replace the whole project folder again.
  window.shareLocation = start;
  window.stopLocation = stop;

  document.addEventListener("visibilitychange", () => {
    if(document.hidden) return;
    Object.keys(watches).forEach(id => {
      navigator.geolocation.getCurrentPosition(
        p => publish(id,p).catch(console.error),
        () => {},
        {enableHighAccuracy:true, maximumAge:0, timeout:15000}
      );
    });
  });

  window.addEventListener("beforeunload", () => Object.keys(watches).forEach(stop));
})();
