import 'server-only';

// True on Vercel itself: during its build and in its functions. `vercel env pull` copies VERCEL=1 and placeholders for
// secrets into .env.local, so a local server must not take those as proof; the region and deployment id exist only on
// Vercel.
export const onVercel = Boolean(process.env.VERCEL_REGION || process.env.VERCEL_DEPLOYMENT_ID)
  || (Boolean(process.env.VERCEL) && process.env.NEXT_PHASE === 'phase-production-build');
