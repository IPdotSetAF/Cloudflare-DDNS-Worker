# Cloudflare DDNS Worker

A Cloudflare Worker that can act as a self-hosted Dynamic DNS (DDNS) provider for routers and clients that support custom DDNS update URLs. It implements a DynDNS-compatible update endpoint and updates DNS records in Cloudflare directly.

## What this worker supports

- A DynDNS-style update endpoint at `/nic/update`
- HTTP Basic Auth for authentication
- A required `hostname` parameter
- An optional `myip` parameter for the public IP address
- Automatic IP detection from the request when `myip` is omitted
- Automatic selection of `A` vs `AAAA` records based on the supplied IP address
- Cloudflare DNS record lookup and update
- DynDNS-style response text such as `good`, `nochg`, `badauth`, `nohost`, and `dnserr`

## How it works

When the worker receives a request to `/nic/update`, it:

1. Validates the request path and authentication.
2. Reads the `hostname` and optional `myip` query parameters.
3. If `myip` is missing, it tries to infer the client IP from the request headers (`CF-Connecting-IP` or `X-Forwarded-For`).
4. Looks up the matching DNS record in the configured Cloudflare zone.
5. Updates the record if the stored content differs from the supplied IP.

## Expected request format

The worker expects a request similar to:

```bash
curl -u "your-username:your-password" \
  "https://your-worker.example.com/nic/update?hostname=home.example.com&myip=203.0.113.10"
```

### Parameters

- `hostname` (required): the DNS name to update
- `myip` (optional): the IP address to set

If `myip` is omitted, the worker will try to detect it automatically from the incoming request.

## DynDNS-style response codes

The worker returns plain text responses with a trailing newline:

- `good <ip>`: record updated successfully
- `nochg <ip>`: the record already had the requested value
- `badauth`: authentication failed
- `nohost`: the hostname was missing or no matching DNS record was found
- `dnserr`: an internal DNS update error occurred

## Setup

1. Create a Cloudflare API token with the following permissions:
   - Zone → Zone → Read
   - Zone → DNS → Edit
   - Zone resources: either all zones or the specific target zone
2. Create a new Cloudflare Worker.
3. Copy the contents of [Worker.js](Worker.js) into the worker script.
4. Add the following environment variables in the Worker settings:
   - `CF_API_TOKEN`: the API token created in step 1
   - `CF_ZONE_ID`: the Cloudflare zone ID for the DNS zone
   - `DDNS_USERNAME`: the username to use for Basic Auth
   - `DDNS_PASSWORD`: the password to use for Basic Auth
5. Optionally assign a custom domain or subdomain to the worker.

## Example

```bash
curl -u "ddns-user:super-secret-password" \
  "https://ddns.example.com/nic/update?hostname=router.example.com"
```

If the request comes from a client that exposes its IP address correctly, the worker will update the Cloudflare record automatically.

## Notes

- Only the `/nic/update` path is supported. Other paths return `404`.
- The worker updates the record with `proxied: false` and automatic TTL.
- If multiple DNS records exist for the same hostname, the worker prefers an `A` or `AAAA` record matching the IP type; otherwise it uses the first matching result.
