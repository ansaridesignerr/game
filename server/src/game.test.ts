import { describe, it, expect } from "vitest";
import * as G from "./game";
function mk() {
  const ps = [0, 1, 2, 3].map((i) => G.newPlayer("P" + i, "🦁"));
  const r = G.createRoom("ABCDEF", ps[0], () => {}); ps.slice(1).forEach((p) => G.addPlayer(r, p));
  expect(G.start(r, ps[0].id)).toBeNull(); r.phase = "CARD_SELECTION"; return { r, ps };
}
function play(r: G.Room, ps: G.Player[], correct: boolean) {
  ps.forEach((p, i) => expect(G.pick(r, p.id, r.round, i)).toBeNull());
  r.phase = "WAZEER_RESPONSE";
  const w = ps.find((p) => r.roles[p.id] === "WAZEER")!;
  expect(G.respond(r, w.id, r.round)).toBeNull();
  const target = ps.find((p) => r.roles[p.id] === (correct ? "CHOR" : "SIPAHI"))!;
  expect(G.guess(r, w.id, r.round, target.id)).toBeNull(); return w;
}
describe("game", () => {
  it("rejects 5th player and early start", () => {
    const { r } = mk(); r.phase = "LOBBY"; expect(G.addPlayer(r, G.newPlayer("x", "a"))).toBeTruthy();
    const r2 = G.createRoom("Z", G.newPlayer("h", "a"), () => {}); expect(G.start(r2, r2.hostId)).toBeTruthy();
  });
  it("unique roles, one card per pick", () => {
    const { r, ps } = mk(); expect(G.pick(r, ps[0].id, 1, 0)).toBeNull();
    expect(G.pick(r, ps[1].id, 1, 0)).toBeTruthy(); expect(G.pick(r, ps[0].id, 1, 1)).toBeTruthy();
    [1, 2, 3].forEach((i) => G.pick(r, ps[i].id, 1, i)); expect(new Set(Object.values(r.roles)).size).toBe(4);
  });
  it("hides other roles", () => {
    const { r, ps } = mk(); G.pick(r, ps[0].id, 1, 0); G.pick(r, ps[1].id, 1, 1);
    const v = G.view(r, ps[0].id); expect(v.players[0].role).toBeDefined(); expect(v.players[1].role).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain(r.roles[ps[1].id]);
  });
  it("scores correct guess = 1700 total", () => {
    const { r, ps } = mk(); play(r, ps, true); const t = Object.values(r.delta);
    expect(t.reduce((a, b) => a + b)).toBe(1700); expect(r.phase).toBe("ROUND_RESULTS");
  });
  it("wrong guess swaps wazeer/chor, 1700 total, no duplicate scoring", () => {
    const { r, ps } = mk(); const w = play(r, ps, false);
    const chor = ps.find((p) => r.roles[p.id] === "CHOR")!; expect(r.delta[w.id]).toBe(0); expect(r.delta[chor.id]).toBe(500);
    expect(G.guess(r, w.id, r.round, chor.id)).toBeTruthy(); expect(ps.reduce((a, p) => a + p.score, 0)).toBe(1700);
  });
  it("non-wazeer cannot guess; stale round rejected", () => {
    const { r, ps } = mk(); ps.forEach((p, i) => G.pick(r, p.id, 1, i)); r.phase = "CHOR_GUESS";
    const nw = ps.find((p) => r.roles[p.id] !== "WAZEER")!; expect(G.guess(r, nw.id, 1, ps[0].id)).toBeTruthy();
    const w = ps.find((p) => r.roles[p.id] === "WAZEER")!; expect(G.guess(r, w.id, 99, ps[0].id)).toBeTruthy();
  });
  it("win condition, ties => joint winners, rematch resets", () => {
    const { r, ps } = mk(); ps.forEach((p, i) => G.pick(r, p.id, 1, i)); r.phase = "CHOR_GUESS";
    ps.forEach((p) => (p.score = 4500)); ps.forEach((p) => (p.score = 4500));
    const w = ps.find((p) => r.roles[p.id] === "WAZEER")!; const s = ps.find((p) => r.roles[p.id] === "CHOR")!;
    G.guess(r, w.id, 1, s.id); expect(r.phase).toBe("GAME_OVER"); expect(r.winners.length).toBe(1);
    G.rematch(r, ps[0].id); expect(ps.every((p) => p.score === 0)).toBe(true);
  });
});
