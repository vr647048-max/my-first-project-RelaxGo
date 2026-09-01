# TherapyOnWay payment launch checklist

## Razorpay
The website supports online Razorpay checkout through the Supabase `razorpay-payment` Edge Function.

### Test vs Live
The browser does not choose test/live mode. Razorpay mode is determined by the credentials stored in Supabase Edge Function secrets.

For production, replace the TEST credentials with the LIVE credentials:
- `RAZORPAY_KEY_ID` = Live Key ID (`rzp_live_...`)
- `RAZORPAY_KEY_SECRET` = Live Key Secret

Never put the secret in `config.js`, GitHub, or browser code.

After changing the secrets, create a real small payment from a real phone and verify the booking is created with `payment_status = paid`.

## UPI
Razorpay Checkout supports UPI on supported Indian accounts/payment methods. The website should not implement a homemade UPI flow. UPI availability is controlled by Razorpay account activation and checkout configuration. In live mode, enable/activate UPI in the Razorpay Dashboard if it is not already enabled.

## Cash on Delivery / Pay at Service
The customer UI may offer `Cash on Service` as an alternative payment method. Such bookings must be stored as `payment_status = pending` and must NOT be marked paid until the provider/admin confirms collection. Online bookings remain `paid` only after server-side Razorpay signature verification.

## Launch safety
Do not advertise the site as accepting live money until Razorpay live credentials are installed and a real end-to-end payment has been verified.
