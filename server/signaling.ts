import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

// Relays WebRTC negotiation metadata only; no file bytes ever reach this service.
const app = express();
const httpServer = createServer(app);
app.get('/', (_request, response) => response.status(200).json({ service: 'DropLink signaling', status: 'ok' }));
const allowedOrigins = process.env.CLIENT_ORIGIN?.split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      const normalized = origin?.replace(/\/$/, '');
      const isAllowed = !allowedOrigins?.length || !normalized || allowedOrigins.includes(normalized);
      callback(isAllowed ? null : new Error(`Origin not allowed: ${origin}`), isAllowed);
    },
    methods: ['GET', 'POST'],
    credentials: false,
  }
});
const rooms = new Map<string, Set<string>>();

io.on('connection', socket => {
  console.log(`Client connected: ${socket.id}`);
  socket.on('join', ({ code }: { code: string }) => {
    if (!/^\d{6}$/.test(code)) {
      console.warn(`Rejected invalid pairing code from ${socket.id}`);
      return socket.emit('pairing-error', 'Invalid connection code');
    }
    const room = `drop-${code}`, members = rooms.get(room) ?? new Set<string>();
    if (members.size >= 2) {
      console.warn(`Rejected third device for pairing code ${code}`);
      return socket.emit('pairing-error', 'This connection already has two devices');
    }
    members.add(socket.id); rooms.set(room, members); socket.join(room);
    console.log(`Client joined pairing code ${code}; ${members.size}/2 device(s) connected`);
    if (members.size === 2) {
      console.log(`Pairing code ${code} matched; notifying devices to begin WebRTC negotiation`);
      io.to(room).emit('peer-ready');
    }
  });
  socket.on('signal', ({ code, payload }) => {
    const messageType = typeof payload?.type === 'string' ? payload.type : 'unknown';
    console.log(`Relaying WebRTC ${messageType} for pairing code ${code}`);
    socket.to(`drop-${code}`).emit('signal', payload);
  });
  socket.on('disconnecting', () => socket.rooms.forEach(room => { const members = rooms.get(room); members?.delete(socket.id); socket.to(room).emit('peer-left'); if (!members?.size) rooms.delete(room); }));
  socket.on('disconnect', reason => console.log(`Client disconnected: ${socket.id}; reason: ${reason}`));
});
const port = Number(process.env.PORT ?? process.env.SIGNAL_PORT ?? 3001);
httpServer.listen(port, () => console.log(`DropLink signaling on :${port}`));
