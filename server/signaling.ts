import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

// Relays WebRTC negotiation metadata only; no file bytes ever reach this service.
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000' } });
const rooms = new Map<string, Set<string>>();

io.on('connection', socket => {
  socket.on('join', ({ code }: { code: string }) => {
    if (!/^\d{6}$/.test(code)) return socket.emit('pairing-error', 'Invalid connection code');
    const room = `drop-${code}`, members = rooms.get(room) ?? new Set<string>();
    if (members.size >= 2) return socket.emit('pairing-error', 'This connection already has two devices');
    members.add(socket.id); rooms.set(room, members); socket.join(room); socket.to(room).emit('peer-ready');
  });
  socket.on('signal', ({ code, payload }) => socket.to(`drop-${code}`).emit('signal', payload));
  socket.on('disconnecting', () => socket.rooms.forEach(room => { const members = rooms.get(room); members?.delete(socket.id); if (!members?.size) rooms.delete(room); }));
});
httpServer.listen(Number(process.env.SIGNAL_PORT ?? 3001), () => console.log('DropLink signaling on :3001'));
