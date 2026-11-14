/**
 * Whether the sign-in email carries the 8-digit code (and the token_hash
 * link to /auth/confirm). That needs Supabase's email templates changed,
 * which a free-tier project can only do once custom SMTP is set up
 * (ARCHITECTURE.md, Auth). Until then the email holds Supabase's default
 * link, which signs in the browser that asked, so the form asks for no code
 * and its messages don't mention one. Turn this on in the same change that
 * applies the templates.
 */
export const SIGN_IN_EMAIL_HAS_CODE = false;
