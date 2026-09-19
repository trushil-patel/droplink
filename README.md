# DropLink

For a full explanation of the architecture, stack, pairing flow, deployment, troubleshooting, and next improvements, see [the DropLink technical guide](docs/DROPLINK_GUIDE.md).

DropLink sends files and editor text directly between browsers using encrypted WebRTC data channels. STUN helps discover reachable addresses; no TURN relay is configured. Socket.IO only relays connection metadata; it never receives file contents.

## Local development

### Folder transfers

In **FILES** mode, click **Choose folder**. DropLink prepares `folder-name.zip` locally, preserving the selected files' paths and subfolders. Enter the receiver code and request the transfer as usual. After acceptance, the receiver downloads one ZIP and extracts it. The ZIP is removed from the sender's list after receipt confirmation. No upload or relay server is added.

Folder preparation is limited to 250 MiB and 10,000 files because it uses browser memory; less powerful devices may need smaller folders. Empty directories, permissions and symlink semantics are not preserved. Folder-picker support depends on the browser/device. If unavailable, or for larger folders, create a ZIP with your operating system and send it as a normal file. Use **Choose folder** rather than dropping a directory into the ordinary file drop zone.

```bash
npm.cmd install
npm.cmd run signal # Socket.IO at http://localhost:3001
npm.cmd run dev    # Next.js UI at http://localhost:3000
```

Copy `.env.example` to `.env.local` and set NEXT_PUBLIC_SIGNALING_URL before starting Next.js. Use two browsers/devices: select files on the sender, enter the receiver's six-digit code, request transfer, then accept on the receiver. The selected files start transferring automatically when the secure connection opens.

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

## Sending code or text

Select **CODE / TEXT**, paste your snippet, enter the receiver's device code, and click **Send text**. The receiver clicks **Accept & open editor**; the text transfers automatically into a separate received editor with a **Copy code** button. Editors show line numbers and counts, support tab indentation, and scroll horizontally without wrapping long lines. Text is sent as chunked UTF-8 over WebRTC, preserving spaces, tabs and blank lines without formatting or executing code. Received text stays in browser memory and is lost on refresh unless copied elsewhere.

Deploy both the frontend on Vercel and the updated signaling service on Render for the text-specific acceptance prompt. Refresh both devices after deployment. Run `node --test tests/text-transfer.test.mjs` to check the text encoding/chunking round trip; this does not replace a live two-device test.

## STUN-only setup

1. Keep `NEXT_PUBLIC_SIGNALING_URL` set to your Render signaling URL in Vercel.
2. TURN credentials are no longer used. You can remove `METERED_DOMAIN`, `METERED_TURN_API_KEY` and any Cloudflare TURN variables from Vercel and local environment files.
3. Push the changes and redeploy Vercel. Render signaling needs no changes. Refresh both devices so they run the same version.
4. Request and accept a file or text transfer. Test on the same Wi-Fi first, then on separate networks.

The browser uses `stun:stun.l.google.com:19302` and `iceTransportPolicy: "all"` with no TURN servers. There is no credential API call or paid relay fallback. Render still exchanges pairing, request and connection metadata, but does not carry file/text contents. Existing fixed device codes and automatic sending after acceptance are unchanged.

Different networks can connect when their NAT/router/firewall rules permit it. STUN does not guarantee connectivity. If connection establishment fails, try another network and refresh both pages; the app reports that TURN fallback is disabled. Both browsers must remain open. Direct connections can reveal network addresses to the other device.

Run `node --import tsx --test tests/webrtc-config.test.ts tests/text-transfer.test.mjs` to verify STUN-only configuration and text-format preservation. Live two-device testing is still required. To inspect the selected path, use browser WebRTC diagnostics such as `chrome://webrtc-internals`; the selected pair should not contain a `relay` candidate.
