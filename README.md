# Badshah Wazeer Sipahi Chor — Real-Time Multiplayer Game

A traditional four-player role game (Badshah, Wazeer, Sipahi, Chor) playable in the browser by four real people in a private room. The server is authoritative: it shuffles roles, validates every action, and never sends hidden roles to other players.

## Features
- Create / join private rooms with a 6-character code and invite link (`/?room=CODE`)
- Exactly 4 human players, host-only start, waiting lobby
- Round flow: shuffle → pick a card → private role reveal → Badshah / Wazeer dialogue → Wazeer guesses the Chor → results → next round
- Scoring: Badshah 1000, Wazeer 500, Sipahi 200, Chor 0. A wrong guess swaps Wazeer's and Chor's points. Every round awards exactly 1700 points.
- First to 5000 wins (ties = joint winners), Play Again / Copy Final Results
- Live leaderboard with progress bars, floating reactions (rate-limited), mute toggle
- Reconnect via server-issued session token (60 s grace period), host transfer
- Mobile-responsive layout, reduced-motion support
- Roman Urdu dialogue throughout

## Technology stack
| Part | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, plain CSS (animations via CSS keyframes), emoji avatars/icons |
| Backend | Node.js, Express, Socket.IO, TypeScript |
| Tests | Vitest (game-logic unit tests) |

> Note: the design uses plain CSS and CSS animations. Tailwind CSS and Framer Motion are **not** used in this project, so there are no Tailwind/PostCSS config files. No image assets are needed (all icons are emoji).

## Project structure
```
badshah-wazeer-multiplayer-game/
├─ client/                 React + Vite frontend
│  ├─ src/ (main.tsx, App.tsx, styles.css)
│  ├─ index.html, vite.config.ts, tsconfig.json
│  ├─ package.json, .env.example
├─ server/                 Express + Socket.IO backend
│  ├─ src/ (index.ts = sockets, game.ts = game logic, game.test.ts = tests)
│  ├─ tsconfig.json, package.json, .env.example
├─ standalone/             Optional single-file claude.ai Artifact version (reference only)
├─ package.json            Convenience scripts
└─ README.md
```

## Installation
Requires Node.js 18+.
```bash
npm run install:all        # or: cd server && npm i ; cd ../client && npm i
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### Environment variables (placeholders only, no secrets)
| File | Variable | Meaning |
|---|---|---|
| `server/.env` | `PORT` | Port for the backend (default `3001`) |
| `server/.env` | `CLIENT_ORIGIN` | Allowed frontend origin(s) for CORS, comma-separated (e.g. `http://localhost:5173`) |
| `client/.env` | `VITE_SERVER_URL` | Backend URL the browser connects to (default `http://localhost:3001`) |

Note: the server reads `process.env` directly; export the variables in your shell or hosting dashboard (or use `node --env-file=.env`). Defaults work for local development without any `.env`.

## Run locally
Backend (terminal 1):
```bash
cd server && npm run dev        # http://localhost:3001  (health: /health)
```
Frontend (terminal 2):
```bash
cd client && npm run dev        # http://localhost:5173
```
Tests: `cd server && npm test`

## Test with 4 players locally
1. Start backend and frontend.
2. Window 1 (normal): open http://localhost:5173 → **Create Room** → copy the code or invite link.
3. Windows 2–4: use **private/incognito windows or different browser profiles** (each browser profile stores one session token). Open the invite link or choose **Join Room** and enter the code.
4. When 4 seats are filled, the host presses **Start Royal Game**.
5. Each window picks a different card; each sees only its own role. Play rounds until someone reaches 5000.
6. To test reconnection, refresh a non-host window mid-round: seat, score and role should return.
Other devices on the same Wi-Fi: set `VITE_SERVER_URL=http://<your-LAN-IP>:3001` and `CLIENT_ORIGIN=http://<your-LAN-IP>:5173`.

## Deployment
**Backend** — needs a host with long-running Node + WebSockets (Render, Railway, Fly.io, a VPS). Not serverless.
- Build: `cd server && npm install && npm run build`; Start: `npm start`
- Set `CLIENT_ORIGIN=https://your-frontend-domain` (and `PORT` if required)

**Frontend** — Vercel / Netlify / any static host. The repo is a monorepo (`client/` + `server/`); `vite` is only declared in `client/package.json`, so Vercel must install and build inside `client/`.
- **Recommended:** Vercel → Project Settings → General → **Root Directory = `client`**. The included `client/vercel.json` sets Framework Vite, install `npm install --include=dev`, build `npm run build`, output `dist`.
- Alternative: leave Root Directory empty (repo root); the root `vercel.json` then installs and builds `client/` and publishes `client/dist`.
- In Settings → Build & Development, turn **Override OFF** for Build/Install commands so the `vercel.json` values apply, and do not set `NODE_ENV=production` for the build (it makes npm skip devDependencies such as Vite).
- Set `VITE_SERVER_URL=https://your-backend-domain` **before** building.
- Commit lockfiles: run `npm install` once in `client/` and `server/` and commit both `package-lock.json` files.

**Scaling:** rooms live in server memory (a restart ends active games). For multiple backend instances, add `@socket.io/redis-adapter` and move room state to Redis.

## Security model
Secret roles and the card-to-role mapping exist only in server memory; each client receives a per-player filtered view. Player identity is a server-issued token, every event is validated for sender, phase and round number, and scoring is idempotent.

## Known limitations
No in-game chat, fireworks, or flying-score animation yet; sounds are simple tones; round timers don't pause while a player is disconnected (match ends after 60 s if they don't return).
