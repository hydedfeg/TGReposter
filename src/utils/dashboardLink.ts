/**
 * Public marketing CTA destination. Staging and previews use the dashboard
 * hosted on their own origin, avoiding accidental production cross-links.
 */
export const PRODUCTION_DASHBOARD_URL = "https://api.tgreposter.com/";
export const STAGING_RAILWAY_HOSTNAME = "tgreposter-staging-production.up.railway.app";

export function isStagingRailwayHostname(hostname: string): boolean {
  return hostname.toLowerCase() === STAGING_RAILWAY_HOSTNAME;
}

export function getMarketingDashboardHref(hostname: string): string {
  const host = hostname.toLowerCase();
  if (
    isStagingRailwayHostname(host) ||
    host.endsWith(".vercel.app") ||
    ["localhost", "127.0.0.1", "terminal.local"].includes(host)
  ) {
    return "/dashboard/";
  }

  return PRODUCTION_DASHBOARD_URL;
}
