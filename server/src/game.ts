import { randomInt, randomBytes } from "node:crypto";

export type Role = "BADSHAH" | "WAZEER" | "SIPAHI" | "CHOR";
export type Phase = "LOBBY" | "SHUFFLING" | "CARD_SELECTION" | "BADSHAH_DIALOGUE" | "WAZEER_RESPONSE" | "CHOR_GUESS" | "ROUND_RESULTS" | "GAME_OVER";
export const POINTS: Record<Role, number> = { BADSHAH: 1000, WAZEER: 500, SIPAHI: 200, CHOR: 0 };
const ROLES: Role[] = ["BADSHAH", "WAZEER", "SIPAHI", "CHOR"];

export interface Player { id: string; token: string; nickname: string; avatar: string; score: number; connected: boolean; socketId?: string; dropTimer?: NodeJS.Timeout; lastReact?: number }
export interface Room {
  code: string; hostId: string; players: Player[]; round: number; phase: Phase; target: number;
  // PRIVATE: never serialize directly, always go through view()
  roles: Record<string, Role>; cards: Role[]; cardOwner: (string | null)[];
  guess?: { suspectId: string; correct: boolean }; delta: Record<string, number>; settled: boolean;
  winners: string[]; nextAt?: number; timer?: NodeJS.Timeout; notify: () => void;
}

export function shuffle<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = randomInt(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; }
export const newPlayer = (nickname: string, avatar: string): Player => ({ id: randomBytes(4).toString("hex"), token: randomBytes(24).toString("hex"), nickname, avatar, score: 0, connected: true });
export function genCode(exists: (c: string) => boolean): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c: string;
  do { c = Array.from({ length: 6 }, () => A[randomInt(A.length)]).join(""); } while (exists(c)); return c;
}
export function createRoom(code: string, host: Player, notify: () => void): Room {
  return { code, hostId: host.id, players: [host], round: 0, phase: "LOBBY", target: 5000, roles: {}, cards: [], cardOwner: [null, null, null, null], delta: {}, settled: false, winners: [], notify };
}
const later = (r: Room, ms: number, fn: () => void) => { clearTimeout(r.timer); r.timer = setTimeout(fn, ms); r.timer.unref?.(); };
const who = (r: Room, role: Role) => r.players.find((p) => r.roles[p.id] === role);

export function addPlayer(r: Room, p: Player): string | null {
  if (r.phase !== "LOBBY") return "Khel shuru ho chuka hai.";
  if (r.players.length >= 4) return "Room full hai (4/4).";
  r.players.push(p); r.notify(); return null;
}
export function start(r: Room, pid: string): string | null {
  if (r.hostId !== pid) return "Sirf host khel shuru kar sakta hai.";
  if (r.phase !== "LOBBY") return "Khel pehle se jari hai.";
  if (r.players.length !== 4 || r.players.some((p) => !p.connected)) return "Poore 4 connected players chahiye.";
  startRound(r); return null;
}
export function startRound(r: Room) {
  r.round++; r.roles = {}; r.cards = shuffle(ROLES); r.cardOwner = [null, null, null, null];
  r.guess = undefined; r.delta = {}; r.settled = false; r.nextAt = undefined; r.phase = "SHUFFLING"; r.notify();
  later(r, 2800, () => { r.phase = "CARD_SELECTION"; r.notify(); });
}
export function pick(r: Room, pid: string, round: number, i: number): string | null {
  if (round !== r.round || r.phase !== "CARD_SELECTION") return "Abhi parchi nahi utha sakte.";
  if (!Number.isInteger(i) || i < 0 || i > 3) return "Ghalat parchi.";
  if (r.cardOwner[i]) return "Yeh parchi pehle hi uth chuki hai.";
  if (r.cardOwner.includes(pid)) return "Aap parchi utha chuke hain.";
  r.cardOwner[i] = pid; r.roles[pid] = r.cards[i];
  if (r.cardOwner.every(Boolean)) { r.phase = "BADSHAH_DIALOGUE"; later(r, 2500, () => { r.phase = "WAZEER_RESPONSE"; r.notify(); }); }
  r.notify(); return null;
}
export function respond(r: Room, pid: string, round: number): string | null {
  if (round !== r.round || r.phase !== "WAZEER_RESPONSE") return "Abhi jawab ka waqt nahi.";
  if (who(r, "WAZEER")?.id !== pid) return "Sirf Wazeer jawab de sakta hai.";
  r.phase = "CHOR_GUESS"; r.notify(); return null;
}
export function guess(r: Room, pid: string, round: number, suspectId: string): string | null {
  if (round !== r.round || r.phase !== "CHOR_GUESS" || r.guess) return "Abhi guess nahi kar sakte.";
  if (who(r, "WAZEER")?.id !== pid) return "Sirf Wazeer guess kar sakta hai.";
  const s = r.roles[suspectId]; if (s !== "SIPAHI" && s !== "CHOR") return "Ghalat shak.";
  r.guess = { suspectId, correct: s === "CHOR" }; settle(r); return null;
}
function settle(r: Room) {
  if (r.settled || !r.guess) return; r.settled = true; // idempotent
  const ok = r.guess.correct;
  for (const p of r.players) {
    const role = r.roles[p.id];
    const pts = role === "WAZEER" ? (ok ? 500 : 0) : role === "CHOR" ? (ok ? 0 : 500) : POINTS[role];
    r.delta[p.id] = pts; p.score += pts;
  }
  const top = Math.max(...r.players.map((p) => p.score));
  if (top >= r.target) { r.phase = "GAME_OVER"; r.winners = r.players.filter((p) => p.score === top).map((p) => p.id); }
  else { r.phase = "ROUND_RESULTS"; r.nextAt = Date.now() + 6000; later(r, 6000, () => startRound(r)); }
  r.notify();
}
export function rematch(r: Room, pid: string): string | null {
  if (r.phase !== "GAME_OVER") return "Match abhi khatam nahi hua.";
  if (!r.players.some((p) => p.id === pid)) return "Aap room mein nahi hain.";
  r.players.forEach((p) => (p.score = 0)); r.round = 0; r.winners = []; startRound(r); return null;
}
export function abort(r: Room) { // grace period expired: end match gracefully
  clearTimeout(r.timer); r.players = r.players.filter((p) => p.connected); r.players.forEach((p) => (p.score = 0));
  r.phase = "LOBBY"; r.round = 0; r.roles = {}; r.cardOwner = [null, null, null, null]; r.guess = undefined;
  if (!r.players.some((p) => p.id === r.hostId) && r.players[0]) r.hostId = r.players[0].id; r.notify();
}

/** The ONLY thing sent to clients. Hidden roles are filtered server-side per viewer. */
export function view(r: Room, me: string) {
  const over = r.phase === "ROUND_RESULTS" || r.phase === "GAME_OVER";
  const open = over || r.phase === "CHOR_GUESS";
  return {
    code: r.code, hostId: r.hostId, me, phase: r.phase, round: r.round, target: r.target, nextAt: r.nextAt,
    players: r.players.map((p) => {
      const role = r.roles[p.id];
      const show = role && (over || p.id === me || (open && (role === "BADSHAH" || role === "WAZEER")));
      return { id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, connected: p.connected, picked: r.cardOwner.includes(p.id), role: show ? role : undefined };
    }),
    cards: r.cardOwner.map((o) => ({ taken: !!o, mine: o === me })),
    result: over && r.guess ? { correct: r.guess.correct, suspectId: r.guess.suspectId, delta: r.delta } : undefined,
    winners: r.phase === "GAME_OVER" ? r.winners : undefined,
  };
}
