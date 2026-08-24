# TherapyOnWay — Production Final Check

**Brand:** TherapyOnWay  
**Tagline:** Professional Massage On Demand  
**Date:** 24 August 2026

## Production checks completed
- Customer booking page is present and connected to the live Supabase project.
- HTTPS GitHub Pages deployment workflow is configured on `main`.
- GPS location is required for a booking and is captured with accuracy.
- Booking workflow is stored in Supabase.
- Provider/Admin dashboard is present with login, booking list, status workflow and navigation.
- Provider live GPS uses `watchPosition()` plus periodic fresh fixes while the dashboard is visible.
- Customer Track page polls the secure tracking RPC and displays provider location on a map when GPS is being shared.
- Supabase Realtime is configured for booking changes used by the dashboard.
- Current booking status constraint is: `New`, `Accepted`, `On the Way`, `Arrived`, `Completed`.
- Services are populated: Hand ₹349, Head ₹499, Shoulder ₹549, Back ₹699, Neck ₹349, Full Body ₹999.
- Business phone/WhatsApp configuration is present in `config.js`.
- No service-role/secret Supabase key is included in the browser configuration.
- RLS is enabled on exposed application tables.
- Public customer booking INSERT was tested successfully under the `anon` role using a transaction that was rolled back.
- Public service catalogue SELECT was tested successfully under the `anon` role.
- Public booking tracking RPC was tested successfully under the `anon` role.
- Provider live-location RPC was tested successfully under the provider's authenticated role using a transaction that was rolled back.
- Supabase security advisor was rerun after the database changes; the mutable-search-path warning for the booking-default trigger was fixed.
- The only remaining Supabase security-advisor warning is leaked-password protection. Supabase reports this feature as a Pro-plan-and-above setting, so it cannot be enabled on the current Free plan. This does not block normal customer booking, provider login, GPS or payment operation.

## Online payment
- Customer booking now uses Razorpay Checkout.
- The production Supabase Edge Function `razorpay-payment` is active (version 10).
- The function validates service/price, creates Razorpay orders, verifies the Razorpay signature and creates the paid booking only after successful verification.
- Recent production logs show successful HTTP 200 payment-function requests on 23 August 2026, confirming the deployed payment endpoint was responding successfully during the latest test.
- Razorpay secret credentials are kept in the Supabase Edge Function environment and are not placed in `config.js`.

## Launch
The GitHub repository is the production source. GitHub Pages provides the HTTPS website and Supabase provides the database/auth/payment backend.

## Final real-device check
The remaining checks that cannot be proven from server/database inspection are the user's actual phone/browser permission prompts, WhatsApp app opening, phone dialing and physical walking movement. The application code is prepared for these flows. Live provider movement can be re-tested/further tuned later without blocking the current booking/payment setup.

## Important
Use the current GitHub version as one complete package. Do not mix files from older RelaxGo/TherapyOnWay folders.
