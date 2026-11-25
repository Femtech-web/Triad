export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.TELEGRAPH_DNS === 'google') await import('@triad/intel/dns');
}
