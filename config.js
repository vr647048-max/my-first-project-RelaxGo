// TherapyOnWay configuration
// Use only the Supabase publishable/anon key here. Never put a service_role/secret key in this file.
window.THERAPY_CONFIG = {
  SUPABASE_URL: "https://xetthdpmvupfzvwdptlt.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_IMw72IIRsVk8VkBByFkr6A_VN9me3fm",
  // Direct business contact. Replace with a masked/virtual number later if desired.
  BUSINESS_PHONE: "917248463222",
  BUSINESS_PHONE_DISPLAY: "+91 724 846 3222",
  BUSINESS_WHATSAPP: "917248463222",
  MASKING_WHATSAPP_URL: "https://wa.me/917248463222",
  BRAND_NAME: "TherapyOnWay",
  TAGLINE: "Professional Massage On Demand",
  PAYMENT_FUNCTION_URL: "https://xetthdpmvupfzvwdptlt.supabase.co/functions/v1/razorpay-payment",
  ADMIN_USER_ID: "d9af623c-0eb5-42cd-b87a-c96bd86793fc"
};
// Backward compatibility for existing pages/scripts.
window.RELAXGO_CONFIG = window.THERAPY_CONFIG;
