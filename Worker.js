export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // DynDNS compatible path
    if (url.pathname !== "/nic/update") {
      return new Response("404", { status: 404 });
    }

    // ---------------------------------------------------------------------
    // Authentication (HTTP Basic Auth)
    // ---------------------------------------------------------------------
    const authHeader = request.headers.get("Authorization");

    if (!authHeader?.startsWith("Basic ")) {
      return dynResponse("badauth", 401, {
        "WWW-Authenticate": 'Basic realm="DynDNS"',
      });
    }

    let username, password;

    try {
      const credentials = atob(authHeader.slice(6));
      [username, password] = credentials.split(":");
    } catch {
      return dynResponse("badauth", 401);
    }

    if (
      username !== env.DDNS_USERNAME ||
      password !== env.DDNS_PASSWORD
    ) {
      return dynResponse("badauth", 401);
    }

    // ---------------------------------------------------------------------
    // Parameters
    // ---------------------------------------------------------------------

    const hostname = url.searchParams.get("hostname");
    let ip = url.searchParams.get("myip");

    if (!hostname) {
      return dynResponse("nohost", 400);
    }

    // Auto-detect IP if router did not send one
    if (!ip) {
      ip =
        request.headers.get("CF-Connecting-IP") ||
        request.headers.get("X-Forwarded-For");

      if (!ip) {
        return dynResponse("dnserr", 500);
      }
    }

    // ---------------------------------------------------------------------
    // Lookup DNS record
    // ---------------------------------------------------------------------

    const lookupResp = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records?name=${encodeURIComponent(
        hostname
      )}`,
      {
        headers: {
          Authorization: `Bearer ${env.CF_API_TOKEN}`,
        },
      }
    );

    const lookup = await lookupResp.json();

    if (!lookup.success || lookup.result.length === 0) {
      return dynResponse("nohost", 404);
    }

    // Prefer matching A/AAAA type
    const desiredType = ip.includes(":") ? "AAAA" : "A";

    const record =
      lookup.result.find((r) => r.type === desiredType) ??
      lookup.result[0];

    // No change required
    if (record.content === ip) {
      return dynResponse(`nochg ${ip}`);
    }

    // ---------------------------------------------------------------------
    // Update record
    // ---------------------------------------------------------------------

    const updateResp = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records/${record.id}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${env.CF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: desiredType,
          name: hostname,
          content: ip,
          ttl: 1, // automatic
          proxied: false,
        }),
      }
    );

    const update = await updateResp.json();

    if (!update.success) {
      console.error(update.errors);
      return dynResponse("dnserr", 500);
    }

    return dynResponse(`good ${ip}`);
  },
};

function dynResponse(text, status = 200, extraHeaders = {}) {
  return new Response(text + "\n", {
    status,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}