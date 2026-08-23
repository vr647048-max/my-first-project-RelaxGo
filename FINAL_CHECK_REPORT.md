# TherapyOnWay — Production Final Check

**Brand:** TherapyOnWay  
**Tagline:** Professional Massage On Demand  
**Date:** 23 August 2026

## Production checks completed
- Customer booking page is present and connected to the live Supabase project.
- GPS location is required for a booking and is captured with accuracy.
- Booking workflow is stored in Supabase.
- Provider/Admin dashboard is present with login, booking list, status workflow and navigation.
- Provider live GPS uses `watchPosition()` plus periodic fresh fixes while the dashboard is visible.
- Customer Track page polls the secure tracking RPC and displays provider location on a map when GPS is being shared.
- Supabase Realtime is configured for booking changes used by the dashboard.
- Current booking status constraint is: `New`, `Accepted`, `On the Way`, `Arrived`, `Completed`.
- Services are populated: Hand ₹399, Head ₹499, Shoulder ₹549, Back ₹699, Neck ₹349, Full Body ₹999.
- Business phone/WhatsApp configuration is present in `config.js`.
- No service-role/secret Supabase key is included in the browser configuration.
- RLS is enabled on exposed application tables.
- Public customer booking INSERT was tested successfully under the `anon` role using a transaction that was rolled back.
- Public service catalogue SELECT was tested successfully under the `anon` role.
- Public booking tracking RPC was tested successfully under the `anon` role.
- Provider live-location RPC was tested successfully under the provider's authenticated role using a transaction that was rolled back.
- Supabase security advisor was rerun after the database changes; the mutable-search-path warning for the booking-default trigger was fixed. The remaining warning is the project-level leaked-password-protection setting.

## Launch
The GitHub repository is the production source. GitHub Pages is used for the HTTPS website and the database is hosted by Supabase.

## Important real-device check
The remaining checks that cannot be proven from server/database inspection are the user's actual phone/browser permission prompts, WhatsApp app opening, phone dialing and physical walking movement. The application code is prepared for these flows, but the final physical test must be performed on the actual customer/provider phone.

## Payment
The booking system is production-ready for booking and service collection. The current payment mode is **Pay after service**. A live online payment gateway should only be added after the business merchant/UPI/payment-account details are available; no payment credentials are invented in this package.

## Launch rule
Use the current GitHub version as one complete package. Do not mix files from older RelaxGo/TherapyOnWay folders.
