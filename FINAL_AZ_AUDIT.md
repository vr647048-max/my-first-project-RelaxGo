# TherapyOnWay — A-to-Z final static audit

Date: 2026-08-22

## Verified
- Customer, provider/admin and tracking pages exist.
- All local HTML asset references resolve.
- `app.js`, `admin.js`, and `track.js` pass Node JavaScript syntax checks.
- Demo `9999999999` contact is absent.
- Direct business Call/WhatsApp contact is restored to the previously supplied number.
- Customer booking requires GPS before submission.
- Booking requires a valid 10-digit customer mobile number and future appointment.
- Database insert policy requires a new booking with customer GPS and prevents anonymous clients from setting provider/status fields.
- Booking status constraint is `New`, `Accepted`, `On the Way`, `Arrived`, `Completed`.
- Provider GPS uses `watchPosition()` plus periodic fresh fixes while the dashboard is visible.
- Provider GPS writes are verified by reading the saved coordinates back.
- Tracking page polls booking tracking every 5 seconds.
- Supabase browser configuration uses a publishable/anon key, not a service-role key.
- Admin page is `noindex,nofollow`.
- Start/Customer/Admin/Track launch files are included.

## Important real-world checks
No static file audit can prove that a particular phone, browser, SIM, WhatsApp installation, GPS permission or network will behave correctly. Before public launch, perform one real booking from a phone and one provider walking test.

## Deployment
For customer GPS on phones, publish the site over HTTPS. The local Python server is for development/testing and should not be treated as public hosting.

## Contact
The user explicitly requested direct Call/WhatsApp instead of masking, so the supplied business contact is intentionally wired into the customer-facing contact buttons.
