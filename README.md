# DropLink

A private, browser-to-browser transfer interface built with Next.js, Tailwind, Framer Motion, QR pairing, and drag-and-drop selection.

```bash
npm install
npm run dev       # UI at http://localhost:3000
npm run signal    # Socket.IO metadata signaling at :3001
```

The signaling service forwards only WebRTC negotiation metadata. Files are designed to travel over encrypted WebRTC DataChannels directly between devices.
