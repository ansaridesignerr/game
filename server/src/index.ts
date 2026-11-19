import express from "express"; import http from "http"; import cors from "cors"; import { Server, Socket } from "socket.io";
import * as G from "./game";

const ORIGINS = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",");
const app = express(); app.use(cors({ origin: ORIGINS })); app.get("/health", (_q, r) => { r.json({ ok: true }); });
const server = http.createServer(app); const io = new Server(server, { cors: { origin: ORIGINS } });
const rooms = new Map<string, G.Room>();
const clean = (s: unknown, n: number) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, n) : "");
const push = (r: G.Room) => r.players.forEach((p) => p.connected && p.socketId && io.to(p.socketId).emit("state", G.view(r, p.id)));
const newRoom = (host: G.Player) => { const code = G.genCode((c) => rooms.has(c)); const room = G.createRoom(code, host, () => push(room)); rooms.set(code, room); return room; };

function attach(s: Socket, r: G.Room, p: G.Player) {
  clearTimeout(p.dropTimer); p.connected = true; p.socketId = s.id; s.data = { code: r.code, pid: p.id }; s.join(r.code);
  s.emit("session", { token: p.token, code: r.code }); push(r);
}
io.on("connection", (s) => {
  const ctx = () => { const r = rooms.get(s.data?.code); const p = r?.players.find((x) => x.id === s.data?.pid); return r && p ? { r, p } : null; };
  const fail = (m: string) => s.emit("room:error", m);
  const run = (fn: (r: G.Room, p: G.Player) => string | null) => { const c = ctx(); if (!c) return fail("Room nahi mila."); const e = fn(c.r, c.p); if (e) fail(e); };

  s.on("room:create", (d) => {
    const nick = clean(d?.nickname, 14); if (!nick) return fail("Nickname likho.");
    const p = G.newPlayer(nick, clean(d?.avatar, 4) || "🦁"); attach(s, newRoom(p), p);
  });
  s.on("room:join", (d) => {
    const nick = clean(d?.nickname, 14); const r = rooms.get(clean(d?.code, 6).toUpperCase());
    if (!nick) return fail("Nickname likho."); if (!r) return fail("Room code ghalat ya expire ho gaya.");
    if (ctx()) return fail("Aap pehle se room mein hain.");
    const p = G.newPlayer(nick, clean(d?.avatar, 4) || "🦁"); const e = G.addPlayer(r, p); if (e) return fail(e); attach(s, r, p);
  });
  s.on("room:rejoin", (d) => {
    const r = rooms.get(clean(d?.code, 6)); const p = r?.players.find((x) => x.token === d?.token);
    if (!r || !p) return s.emit("session:invalid");
    if (p.socketId && p.socketId !== s.id) io.sockets.sockets.get(p.socketId)?.disconnect(true); // same player, new browser
    attach(s, r, p);
  });
  s.on("room:leave", () => { const c = ctx(); if (c) { drop(c.r, c.p, true); s.data = {}; s.emit("session:invalid"); } });
  s.on("game:start", () => run((r, p) => G.start(r, p.id)));
  s.on("card:pick", (d) => run((r, p) => G.pick(r, p.id, d?.round, d?.index)));
  s.on("wazeer:respond", (d) => run((r, p) => G.respond(r, p.id, d?.round)));
  s.on("wazeer:guess", (d) => run((r, p) => G.guess(r, p.id, d?.round, d?.suspectId)));
  s.on("game:rematch", () => run((r, p) => G.rematch(r, p.id)));
  s.on("player:reaction", (d) => { const c = ctx(); if (!c) return; const t = clean(d?.text, 30); const now = Date.now();
    if (!t || now - (c.p.lastReact || 0) < 800) return; c.p.lastReact = now; io.to(c.r.code).emit("reaction", { from: c.p.id, text: t }); });
  s.on("disconnect", () => { const c = ctx(); if (c && c.p.socketId === s.id) drop(c.r, c.p, false); });
});
function drop(r: G.Room, p: G.Player, leave: boolean) {
  p.connected = false; p.socketId = undefined;
  if (r.phase === "LOBBY" || leave && r.phase === "LOBBY") r.players = r.players.filter((x) => x !== p);
  if (r.hostId === p.id) { const n = r.players.find((x) => x.connected); if (n) r.hostId = n.id; }
  if (!r.players.some((x) => x.connected)) { setTimeout(() => { if (!r.players.some((x) => x.connected)) { clearTimeout(r.timer); rooms.delete(r.code); } }, 10 * 60_000).unref(); return; }
  if (r.phase !== "LOBBY") p.dropTimer = setTimeout(() => !p.connected && G.abort(r), 60_000); // 60s grace to reconnect
  push(r);
}
server.listen(Number(process.env.PORT) || 3001, () => console.log("BWSC server up"));
