import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

type Role = "BADSHAH" | "WAZEER" | "SIPAHI" | "CHOR";
interface P { id: string; nickname: string; avatar: string; score: number; connected: boolean; picked: boolean; role?: Role }
interface V { code: string; hostId: string; me: string; phase: string; round: number; target: number; nextAt?: number; players: P[]; cards: { taken: boolean; mine: boolean }[];
  result?: { correct: boolean; suspectId: string; delta: Record<string, number> }; winners?: string[] }

const socket = io(import.meta.env.VITE_SERVER_URL || "http://localhost:3001");
const send = (e: string, d?: unknown) => socket.emit(e, d);
const AVATARS = ["🦁", "🐯", "🐵", "🦊", "🐸", "🐼", "🦄", "🐙"];
const ICON: Record<Role, string> = { BADSHAH: "👑", WAZEER: "🧐", SIPAHI: "💂", CHOR: "🥷" };
const PTS: Record<Role, number> = { BADSHAH: 1000, WAZEER: 500, SIPAHI: 200, CHOR: 0 };
const REVEAL: Record<Role, [string, string]> = {
  BADSHAH: ["Badshahat Mubarak Ho!", "Ab hukam chalao, Maharaj!"], WAZEER: ["Wazeer Sahab, dimagh lagao!", "Chor ko pehchanna aap ki zimmedari hai!"],
  SIPAHI: ["Sipahi hazir hai!", "Aaj dekhte hain kis par ilzaam lagta hai!"], CHOR: ["Oho! Tum Chor niklay!", "Ab bach kar rehna!"] };
const REACTS = ["Hahaha!", "Oye Chor!", "Jee Hazoor!", "Main Masoom Hoon!", "Wazeer Sahab Socho!", "Badshah Salamat!", "Pakro Pakro!"];

let ctx: AudioContext | null = null; let muted = false;
function beep(f = 440, d = 0.15) { if (muted) return; try { ctx ??= new AudioContext(); const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + d); } catch { /* autoplay blocked */ } }

export default function App() {
  const [v, setV] = useState<V | null>(null); const [err, setErr] = useState(""); const [conn, setConn] = useState(socket.connected);
  const [nick, setNick] = useState(""); const [avatar, setAvatar] = useState(AVATARS[0]); const [mode, setMode] = useState<"" | "create" | "join">("");
  const [code, setCode] = useState(new URLSearchParams(location.search).get("room")?.toUpperCase() || "");
  const [pending, setPending] = useState<string | null>(null); const [reacts, setReacts] = useState<Record<string, string>>({}); const [mute, setMute] = useState(false);
  const [lb, setLb] = useState(false); const prev = useRef("");

  useEffect(() => {
    const tryRejoin = () => { const s = localStorage.getItem("bwsc"); if (s) send("room:rejoin", JSON.parse(s)); };
    socket.on("connect", () => { setConn(true); tryRejoin(); }); socket.on("disconnect", () => setConn(false));
    socket.on("session", (s) => localStorage.setItem("bwsc", JSON.stringify(s)));
    socket.on("session:invalid", () => { localStorage.removeItem("bwsc"); setV(null); });
    socket.on("state", (s: V) => setV(s));
    socket.on("room:error", (m: string) => { setErr(m); setTimeout(() => setErr(""), 3500); });
    socket.on("reaction", (r: { from: string; text: string }) => { setReacts((x) => ({ ...x, [r.from]: r.text })); beep(660, 0.1); setTimeout(() => setReacts((x) => { const n = { ...x }; delete n[r.from]; return n; }), 2500); });
    if (socket.connected) tryRejoin();
    return () => { socket.off(); };
  }, []);
  useEffect(() => { if (v && v.phase !== prev.current) { prev.current = v.phase; setPending(null); beep({ SHUFFLING: 300, CARD_SELECTION: 500, ROUND_RESULTS: 800, GAME_OVER: 1000 }[v.phase] || 400, 0.25); } }, [v]);

  const submit = () => send(mode === "create" ? "room:create" : "room:join", { nickname: nick, avatar, code });
  if (!v) return (
    <main className="wrap center"><h1 className="title">Badshah Wazeer Sipahi Chor</h1>
      <p className="sub">Badshahat ka faisla, Wazeer ki aqal aur Chor ki qismat!</p>
      {!conn && <p className="err">Server se connection nahi hai…</p>}
      {!mode ? <div className="row"><button className="btn" onClick={() => setMode("create")}>Create Room</button><button className="btn alt" onClick={() => setMode("join")}>Join Room</button></div> :
        <div className="card">
          <input placeholder="Nickname" maxLength={14} value={nick} onChange={(e) => setNick(e.target.value)} />
          <div className="row">{AVATARS.map((a) => <button key={a} className={"av" + (a === avatar ? " sel" : "")} onClick={() => setAvatar(a)}>{a}</button>)}</div>
          {mode === "join" && <input placeholder="Room code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />}
          <button className="btn" onClick={submit}>{mode === "create" ? "Banao!" : "Shamil ho jao!"}</button>
          <button className="link" onClick={() => setMode("")}>Back</button></div>}
      {err && <p className="err">{err}</p>}</main>);

  const me = v.players.find((p) => p.id === v.me)!; const isHost = v.hostId === v.me;
  const wz = v.players.find((p) => p.role === "WAZEER"); const meW = me.role === "WAZEER";
  const link = `${location.origin}/?room=${v.code}`;
  const sorted = [...v.players].sort((a, b) => b.score - a.score);

  if (v.phase === "LOBBY") return (
    <main className="wrap center"><h2 className="title sm">Royal Lobby</h2><div className="code">{v.code}</div>
      <div className="row"><button className="btn sm" onClick={() => navigator.clipboard.writeText(v.code)}>Copy Room Code</button><button className="btn sm alt" onClick={() => navigator.clipboard.writeText(link)}>Copy Invite Link</button></div>
      <div className="lobby">{[0, 1, 2, 3].map((i) => { const p = v.players[i]; return <div key={i} className={"seat pop" + (p ? "" : " empty")}>{p ? <><div className="face">{p.avatar}</div><b>{p.nickname}</b>{p.id === v.hostId && <span>👑 host</span>}</> : <span>Waiting for Player...</span>}</div>; })}</div>
      <p>Bas 4 players poore hone dein! ({v.players.length}/4)</p>
      {isHost && <button className="btn" disabled={v.players.length !== 4} onClick={() => send("game:start")}>Start Royal Game</button>}
      <button className="link" onClick={() => send("room:leave")}>Leave</button>{err && <p className="err">{err}</p>}</main>);

  const bubble = ((): string => {
    switch (v.phase) {
      case "SHUFFLING": return "Shuffling... Dekhte hain aaj Badshah kon banta hai!";
      case "CARD_SELECTION": return me.picked ? "Baaki players ki parchi ka intezar hai!" : "Apni qismat ki parchi uthao!";
      case "BADSHAH_DIALOGUE": return "Badshah ka Wazeer kon?";
      case "WAZEER_RESPONSE": return meW ? "Wazeer Sahab, ab aap ki baari!" : "Badshah ka farman aa raha hai!";
      case "CHOR_GUESS": return "Wazeer! Batao in dono mein Chor kon hai?";
      case "ROUND_RESULTS": return v.result?.correct ? "WAH WAZEER WAH! Chor pakra gaya!" : "HAAYE WAZEER! Asli Chor bach nikla!";
      default: return "";
    }
  })();
  const suspects = v.players.filter((p) => p.role !== "BADSHAH" && p.role !== "WAZEER");
  const seat = (p: P, i: number) => (
    <div key={p.id} className={`seat s${i}${p.role === "BADSHAH" && v.phase === "BADSHAH_DIALOGUE" ? " glow" : ""}${p.id === v.me ? " mine" : ""}${p.connected ? "" : " off"}`}>
      {p.role === "BADSHAH" && <div className="crown">👑</div>}{reacts[p.id] && <div className="react">{reacts[p.id]}</div>}
      <div className="face">{p.avatar}</div><b>{p.nickname}{p.id === v.me ? " (aap)" : ""}</b>
      <small>{p.connected ? "🟢" : "🔴 disconnected"} {p.score} pts</small>
      <small>{p.role ? `${ICON[p.role]} ${p.role}` : p.picked ? "🂠 parchi utha li" : ""}</small></div>);

  return (
    <main className="game">
      <header><b>Round {v.round}</b><span>Room {v.code}</span><span>Target: {v.target}</span>
        <button className="link" onClick={() => { muted = !mute; setMute(!mute); }}>{mute ? "🔇" : "🔊"}</button><button className="link lbtn" onClick={() => setLb(!lb)}>🏆</button></header>
      <section className="board">
        {v.players.map(seat)}
        <div className="mid">
          <div className="speech">{bubble}</div>
          <div className={"cards" + (v.phase === "SHUFFLING" ? " shuffle" : "")}>{v.cards.map((c, i) =>
            <button key={i} className={"pcard" + (c.taken ? " taken" : "")} disabled={v.phase !== "CARD_SELECTION" || c.taken || me.picked} onClick={() => { send("card:pick", { round: v.round, index: i }); beep(520, 0.1); }}>
              {c.mine && me.role ? ICON[me.role] : c.taken ? "✓" : "?"}</button>)}</div>
          {me.role && v.phase !== "ROUND_RESULTS" && v.phase !== "GAME_OVER" && v.phase !== "SHUFFLING" && <div className={"reveal r-" + me.role}>{ICON[me.role]} <b>You are {me.role}!</b> {PTS[me.role]} Points<br />{REVEAL[me.role][0]} {REVEAL[me.role][1]}</div>}
          {v.phase === "WAZEER_RESPONSE" && meW && <button className="btn" onClick={() => send("wazeer:respond", { round: v.round })}>Jee Hazooor!</button>}
          {v.phase === "CHOR_GUESS" && wz && <p className="speech sm">{wz.nickname}: “Jee Hazooor! Jee Hazooor!”</p>}
          {v.phase === "CHOR_GUESS" && meW && (pending ? <div className="card"><p>Kya aap ko yaqeen hai ke yehi Chor hai?</p>
            <button className="btn" onClick={() => { send("wazeer:guess", { round: v.round, suspectId: pending }); setPending(null); }}>Haan, yehi Chor hai!</button>
            <button className="btn alt" onClick={() => setPending(null)}>Nahi, dobara sochna hai</button></div> :
            <div className="row">{suspects.map((s) => <button key={s.id} className="suspect" onClick={() => setPending(s.id)}>{s.avatar}<br />{s.nickname}<br />❓ Is this the Chor?</button>)}</div>)}
          {v.phase === "CHOR_GUESS" && !meW && <p>Wazeer Sahab, soch rahe hain…</p>}
        </div>
      </section>
      <footer>{REACTS.map((t) => <button key={t} className="chip" onClick={() => send("player:reaction", { text: t })}>{t}</button>)}</footer>
      <aside className={"lb" + (lb ? " open" : "")}><h3>ROYAL LEADERBOARD</h3>{sorted.map((p, i) => <div key={p.id} className="lbrow">
        <span>{i === 0 && p.score > 0 ? "👑" : i + 1 + "."} {p.avatar} {p.nickname}</span><b>{p.score}</b>
        <div className="bar"><i style={{ width: Math.min(100, (p.score / v.target) * 100) + "%" }} /></div></div>)}</aside>
      {err && <div className="toast">{err}</div>}
      {(v.phase === "ROUND_RESULTS" || v.phase === "GAME_OVER") && v.result && <div className="overlay"><div className="card big">
        {v.phase === "GAME_OVER" ? <><h1>BADSHAHAT KA ASLI CHAMPION! 🎉</h1><h2>{v.winners!.map((id) => v.players.find((p) => p.id === id)!.nickname).join(" & ")} {v.winners!.length > 1 ? "Win!" : "Wins!"}</h2></> :
          <><h2>Round {v.round} Complete!</h2><p>{v.result.correct ? "Chor pakra gaya! Badshah khush hua!" : "Bechara Sipahi phans gaya!"}</p></>}
        <table><thead><tr><th>Player</th><th>Role</th><th>Round</th><th>Total</th></tr></thead><tbody>{sorted.map((p) => <tr key={p.id}><td>{p.avatar} {p.nickname}</td><td>{p.role && ICON[p.role]} {p.role}</td><td>+{v.result!.delta[p.id]}</td><td>{p.score}</td></tr>)}</tbody></table>
        {v.phase === "ROUND_RESULTS" ? <Countdown to={v.nextAt!} /> : <div className="row"><button className="btn" onClick={() => send("game:rematch")}>Play Again</button>
          <button className="btn alt" onClick={() => navigator.clipboard.writeText(sorted.map((p, i) => `${i + 1}. ${p.nickname} - ${p.score}`).join("\n"))}>Copy Final Results</button></div>}
      </div></div>}
    </main>);
}
function Countdown({ to }: { to: number }) {
  const [t, setT] = useState(0); useEffect(() => { const i = setInterval(() => setT(Math.max(0, Math.ceil((to - Date.now()) / 1000))), 250); return () => clearInterval(i); }, [to]);
  return <p>Agli baazi ke liye tayyar ho jao! {t}s</p>;
}
