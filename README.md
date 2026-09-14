# DropLink

DropLink sends selected files directly between browsers using encrypted WebRTC data channels. Socket.IO only relays connection metadata; it never receives file contents.

## Local development

```bash
npm.cmd install
npm.cmd run signal # Socket.IO at http://localhost:3001
npm.cmd run dev    # Next.js UI at http://localhost:3000
```

Use two browsers/devices: select files on the sender, start pairing, then scan its QR code (or enter its six-digit code) on the receiver.

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

The included public STUN server is suitable for testing. Add an authenticated TURN server before relying on transfers across restrictive mobile, office, or carrier networks.
