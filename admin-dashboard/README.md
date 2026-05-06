# Lior Admin Dashboard

This is the standalone operations dashboard for Lior storage and media reliability. It is not part of the consumer app route tree and should be deployed to a separate private URL.

## Local Use

```powershell
cd C:\Users\Sameer\Downloads\Lior\admin-dashboard
npm install
npm run dev
```

Open:

```text
http://localhost:3002/
```

Use the media Worker base URL:

```text
https://lior-media.joinlior.workers.dev
```

Use `ADMIN_DASHBOARD_TOKEN` as the dashboard token. Do not use Supabase service-role keys in the browser.

## Production Deploy

Deploy this folder separately from the mobile/consumer app. Recommended production setup:

```powershell
cd C:\Users\Sameer\Downloads\Lior\admin-dashboard
npm install
npm run deploy:cloudflare
```

Current production Pages URL:

```text
https://lior-admin-dashboard.pages.dev/
```

The dashboard is separate from the Play Store app. It ships only static UI code and the public Worker URL. It does not include `ADMIN_DASHBOARD_TOKEN`, Supabase service-role keys, or any user media data.

## Required Production Access Lock

Before relying on the production URL, put Cloudflare Access in front of the Pages hostname and allow only your email:

1. Open Cloudflare dashboard.
2. Go to Zero Trust -> Access -> Applications.
3. Create an application.
4. Choose Self-hosted.
5. Name it `Lior Admin Dashboard`.
6. Application domain: `lior-admin-dashboard.pages.dev`.
7. Add an Allow policy for your email only, for example `joinlior@gmail.com`.
8. Set session duration to a short value, such as 12 or 24 hours.
9. Save, then open the Pages URL in a private browser window and confirm Cloudflare asks you to log in.

The dashboard token is still required after Cloudflare Access login. Access protects the page; the Worker token protects the backend admin API.

## Security Model

- The mobile app does not include this dashboard.
- The dashboard never stores Supabase service-role credentials.
- The dashboard calls only the Cloudflare Worker admin API.
- The Worker requires `ADMIN_DASHBOARD_TOKEN` for admin actions.
- Cloudflare Access should be used in production so only your identity can open the page.
