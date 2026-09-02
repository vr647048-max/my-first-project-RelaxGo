# TherapyOnWay — Final Payment Status

- Online checkout: Razorpay Checkout. UPI/cards/netbanking are presented according to the payment methods enabled on the Razorpay merchant account.
- Cash on Service: implemented end-to-end. Cash bookings are stored as `payment_method=cash` and `payment_status=unpaid` until collected.
- The Supabase Edge Function `razorpay-payment` has been updated to version 11 with the cash-booking endpoint.
- The website does not contain Razorpay secret keys. Secrets remain in Supabase.
- IMPORTANT: Razorpay LIVE money collection requires LIVE Key ID/Secret in Supabase. Test credentials cannot be converted to live by changing HTML/JavaScript.
