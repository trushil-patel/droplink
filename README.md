# DropLink

For a full explanation of the architecture, stack, pairing flow, deployment, troubleshooting, and next improvements, see [the DropLink technical guide](docs/DROPLINK_GUIDE.md).

DropLink sends selected files between browsers using encrypted WebRTC data channels relayed through Metered TURN. Socket.IO only relays connection metadata; it never receives file contents.

## Local development

```bash
npm.cmd install
npm.cmd run signal # Socket.IO at http://localhost:3001
npm.cmd run dev    # Next.js UI at http://localhost:3000
```

Copy `.env.example` to `.env.local` and fill in your Metered settings before starting Next.js. Use two browsers/devices: select files on the sender, enter the receiver's six-digit code, request transfer, then accept on the receiver. The selected files start transferring automatically when the secure connection opens.

## Deploy the signaling server on Render

The Next.js frontend belongs on Vercel, but its Socket.IO signaling service must run on a host that supports persistent WebSocket connections. These steps deploy only the signaling service to Render.

1. Push the latest project changes to the `main` branch on GitHub.
2. Sign in to [Render](https://dashboard.render.com/) with GitHub.
3. Select **New** > **Web Service**, then select the `droplink` repository.
4. Use these service settings:

   | Field | Value |
   | --- | --- |
   | Name | `droplink-signaling` (or another unique name) |
   | Region | Choose one near your users |
   | Branch | `main` |
   | Runtime | `Node` |
   | Root Directory | Leave empty |
   | Build Command | `npm install` |
   | Start Command | `npm run signal` |
   | Health Check Path | `/` |

5. Under **Environment Variables**, add `CLIENT_ORIGIN` with your Vercel URL, for example `https://droplink.vercel.app`. During testing you can permit both local and production URLs with a comma-separated value: `http://localhost:3000,https://droplink.vercel.app`.
6. Choose a compute plan and click **Create Web Service**. Do not define `PORT`; Render supplies it automatically and the signaling server uses it.
7. Wait for the deploy to succeed, then copy Render’s public HTTPS URL, for example `https://droplink-signaling.onrender.com`. Opening that URL should return a small JSON health response.
8. In Vercel, open the frontend project’s **Settings** > **Environment Variables**. Add:

   ```text
   NEXT_PUBLIC_SIGNALING_URL=https://droplink-signaling.onrender.com
   ```

9. Redeploy the Vercel project. Open the live site on two devices to test pairing and a small file transfer.

Every push to the selected GitHub branch triggers a new Render deployment. When the Vercel domain changes, update `CLIENT_ORIGIN` in Render and let Render redeploy.

## Metered TURN configuration

## Sending code or text

Select **CODE / TEXT**, paste your snippet, enter the receiver's device code, and click **Send text**. The receiver clicks **Accept & open editor**; the text transfers automatically into a separate received editor with a **Copy code** button. Editors show line numbers and counts, support tab indentation, and scroll horizontally without wrapping long lines. Text is sent as chunked UTF-8 over WebRTC, preserving spaces, tabs and blank lines without formatting or executing code. Received text stays in browser memory and is lost on refresh unless copied elsewhere.

Deploy both the frontend on Vercel and the updated signaling service on Render for the text-specific acceptance prompt. Refresh both devices after deployment. Run `node --test tests/text-transfer.test.mjs` to check the text encoding/chunking round trip; this does not replace a live two-device test.

### TURN settings

1. In Vercel, set `METERED_DOMAIN` to your Metered domain (for example `your-app.metered.live`).
2. Set `METERED_TURN_API_KEY` to the credential-specific API key from Metered. Do not use an account master secret or add a `NEXT_PUBLIC_` prefix.
3. Set these for each deployment environment you use, then redeploy. Keep `NEXT_PUBLIC_SIGNALING_URL` pointing to Render; TURN does not replace signaling.
4. Open the new deployment on two devices, one on Wi-Fi and one on mobile data. Request and accept a small file transfer. It starts automatically; confirm the receiver downloads the correct file.

The Next.js `/api/ice-servers` endpoint fetches credentials server-side without caching or returning the API key. Browsers receive the TURN username/password needed to connect. WebRTC uses `iceTransportPolicy: "relay"`, so every transfer consumes Metered relay bandwidth, with no direct-connection fallback. Monitor your plan's quota in Metered. Both browsers must remain open; some networks can still block connections.

If setup fails, the UI reports missing configuration or unavailable TURN credentials. Check Vercel variables and redeploy, then check Metered credential validity and quota. Never commit real credentials. The credential endpoint is public to support anonymous users; TURN credentials are visible to browser users, so apply provider usage limits and rotate credentials if abused.
