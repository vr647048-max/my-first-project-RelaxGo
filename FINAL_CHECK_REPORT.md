# TherapyOnWay — Final Static + Database Check

Package: TherapyOnWay_FINAL_PRODUCTION.zip
Files inspected: 22

## Static checks completed
- All HTML local file references resolve.
- All JavaScript files pass `node --check`.
- TherapyOnWay branding is used by the current UI/config.
- No demo `9999999999` phone number remains.
- Supabase browser config contains a publishable/anon key, not a service-role key.
- Customer booking, Provider/Admin dashboard and Track page are present.
- Call, WhatsApp and Google Maps navigation links are wired.
- Booking status workflow is implemented: New → Accepted → On the Way → Arrived → Completed.
- Local start/launch BAT files are present.
- Logo SVG is present locally.

## Live database check completed
The connected Supabase project has the `bookings_status_check` constraint allowing:
New, Accepted, On the Way, Arrived, Completed.

The `get_booking_tracking` RPC is installed.

## V3 GPS patch
Provider GPS movement code has now been strengthened for mobile browsers. The provider dashboard uses `watchPosition()` plus a fresh GPS request every 4 seconds while visible, and requests a fresh fix when the dashboard becomes visible again. This addresses the common case where a mobile browser delays watch callbacks. A real walking test is still required to confirm the phone/OS reports movement as expected.

## Important limitation
Static inspection and database checks cannot prove every browser/device behavior. Final confirmation of WhatsApp opening, phone dialing, GPS permission, and live movement must be performed on the user's actual devices.

## Launch rule
Use this package as one complete folder. Do not mix files from older RelaxGo/TherapyOnWay folders.
