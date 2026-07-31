import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { getPublicSiteSettings } from "@/lib/server/site-settings";
import { checkUpstreamProxy, createCustomUpstreamProxyEntry } from "@/lib/server/upstream-proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const settings = await getPublicSiteSettings();
    if (!settings.customProxyEnabled) {
      return fail("Custom proxy feature is disabled. Please use the server proxy pool.", 410);
    }

    const body = (await request.json().catch(() => ({}))) as { proxyUrl?: unknown };
    const proxyUrl = String(body.proxyUrl || "").trim();
    if (!proxyUrl) return fail("Please enter a proxy URL first.", 400);

    const entry = (() => {
      try {
        return createCustomUpstreamProxyEntry(proxyUrl);
      } catch {
        return null;
      }
    })();
    if (!entry) return fail("Invalid proxy URL format.", 400);
    const result = await checkUpstreamProxy(entry, { timeoutMs: 15_000, expectedCountry: "" });
    return ok({ result });
  } catch (error) {
    return handleRouteError(error);
  }
}
