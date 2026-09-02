# TherapyOnWay — Final Package Check

Date: 2026-09-01

## Included
- Customer booking website with TherapyOnWay branding
- Six services and current prices
- GPS customer location capture
- Razorpay payment flow prepared; booking is created only after verified payment
- Supabase booking storage and secure tracking RPC
- Provider/Admin dashboard with authentication and workflow
- Provider navigation, Call/WhatsApp and live GPS sharing
- Customer tracking page
- Women-focused SEO landing page and sitemap
- robots.txt and web manifest
- Local start/customer/admin/track launchers

## Validation
- JavaScript syntax checked with Node
- Local HTML references checked
- Required local assets checked
- No demo phone number used
- Browser config contains only Supabase publishable/anon credentials, not a service-role secret

## Final real-world checks still required
A source package cannot prove a real phone's GPS permission, WhatsApp app behavior, cellular calling, or live movement. Perform one real customer booking and one provider walking test before advertising publicly.

Do not mix this package with older RelaxGo/TherapyOnWay folders.
