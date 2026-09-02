# TherapyOnWay — Professional Massage On Demand

A responsive home/hotel/office massage booking website with GPS booking, Supabase storage, provider dashboard, WhatsApp alerts and customer tracking.

## What is included
- TherapyOnWay branding and responsive design
- Six massage services with editable prices
- GPS location capture
- Date/time booking validation
- Supabase booking storage
- Human-friendly TOW booking IDs
- Customer tracking page
- Booking request protection against duplicate submissions
- Provider login/dashboard
- Provider workflow: New → Accepted → On the Way → Arrived → Completed
- Google Maps navigation
- Call + WhatsApp actions
- Provider live GPS sharing (auto-starts when status changes to On the Way)
- Customer status/provider-location polling

## Important fixes in this build
1. **Accept button bug fixed:** older bookings with `pending` status are normalized to `New`, so the Accept button appears.
2. **Booking insert fixed:** customer booking no longer needs public SELECT permission just to get a booking ID.
3. **Tracking privacy fixed:** customers no longer get public access to the entire `bookings` table. Tracking uses a narrow Supabase function and does not expose customer name, phone or exact customer GPS.
4. **Footer phone fixed:** the provider number is read from `config.js` so a wrong shortened number cannot be displayed.
5. **Dead footer links fixed:** phone and WhatsApp support links are wired from the same provider number.
6. **Date/time validation fixed:** past appointments are rejected.
7. **Input safety improved:** customer/provider values rendered into HTML are escaped.
8. **Realtime provider dashboard retained:** authenticated provider sessions receive booking updates.

## Services / sample pricing
- Full Body Massage — 60 min — ₹999
- Head Massage — 30 min — ₹499
- Shoulder Massage — 30 min — ₹549
- Back Massage — 45 min — ₹699
- Hand Massage — 20 min — ₹349
- Neck Massage — 20 min — ₹349

Edit the service cards and booking options in `index.html` if you want different services/prices.

## Supabase setup
1. Open your Supabase project.
2. SQL Editor → run the **complete `schema.sql`** once.
3. Authentication → Users → create the provider login email/password.
4. Verify the project URL and publishable/anon key in `config.js`.
5. Verify `PROVIDER_PHONE` is the correct provider number.
6. If an older build used a `pending` status, the new schema converts it to `New` automatically.

`FIX_BOOKING_CODE.sql` is kept as a duplicate full migration for convenience. Do not mix SQL from older builds with this one.

### Security note
The browser only uses a Supabase publishable/anon key. Never place a service-role/secret key in `config.js`.
Provider dashboard access is role-checked: the configured admin user is treated as admin; other authenticated users must exist in `providers`. A provider claims an unassigned booking when accepting it, so later status/GPS updates stay tied to that provider. Customer tracking uses a narrow RPC and does not expose customer name, phone or exact customer GPS.

Customer tracking does **not** query the whole bookings table. It calls `get_booking_tracking()` and receives only booking status, service/date/time and provider coordinates.

## Local testing
Use START_SERVER.bat, then OPEN_CUSTOMER.bat, OPEN_ADMIN.bat and OPEN_TRACK.bat. Do not open admin.html or track.html directly with the File C:/... address. Provider GPS works on localhost; phone GPS requires the final public HTTPS site.

## Manual end-to-end test
1. Customer site → Book a Massage.
2. Select service.
3. Enter name + 10-digit mobile.
4. Pick a future date/time.
5. Click **Use my location** and wait for **Location captured**.
6. Click **Confirm Booking**.
7. Save the `TOW-xxxxxx` booking ID.
8. Open **Track Booking** and enter the ID.
9. Open `admin.html` and log in with the Supabase provider account.
10. The booking should show **New** with an **Accepted** button.
11. Click **Accepted**, then **On the Way**, then **Arrived**, then **Complete**.
12. While the status is Accepted/On the Way/Arrived, click **Share Live Location** and keep the dashboard open.
13. Refresh/leave the customer tracking page open; provider location is polled automatically.

## Public launch — payment gate
The current package now contains a Razorpay payment flow prepared for Test/Live activation. The secure Edge Function creates Razorpay orders, verifies signatures, and creates the booking only after verified payment. Do not advertise “Pay ₹999 & Book” until a merchant gateway such as Razorpay is connected with a server-side order, signature verification and webhook/capture flow. A gateway secret must never be placed in `config.js` or browser JavaScript.

For live GPS and payments, the public site must use HTTPS. Test customer and provider from separate devices before accepting real customers.

## Images
Service/hero images use web-hosted Unsplash URLs, so internet access is required for those images.

## Diagnostics
Open `DIAGNOSTICS.html` to check whether the browser can load Supabase and whether the `get_booking_tracking()` database function is installed. It does not create a booking.
