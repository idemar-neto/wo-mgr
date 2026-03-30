# ⚽ WoMGR

A team manager for recreational football / futsal. Paste the WhatsApp group list, register each player's arrival time, and draw teams — with the right rules: **first to arrive, first to play.**

![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react&logoColor=black)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2021-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Zero deps](https://img.shields.io/badge/external_dependencies-zero-ff6b1a?style=flat-square)

> 🇧🇷 Versão em português disponível em [README.md](./README.md)

---

## ✨ Features

### 📋 Smart List Parser
Accepts the standard Brazilian WhatsApp group list format, with support for:
- Header line `LISTA-FUTEBOL W.O -DD/MM`
- Numbered outfield player section
- Separate `GOLEIROS` (goalkeepers) section
- `AUSENTES` (absent) section with justification emojis (✈️ 🚑 👨‍💻 etc.)
- Automatically skips empty numbered slots

**Example input:**
```
LISTA-FUTEBOL W.O -28 / 03

1 ...
2 ...
3 ...
...
16 ...

GOLEIROS
1 ...
2 ...

AUSENTES
1 ...
2 ...
```

### ✅ Presence Tracking with Timestamps
- Mark each player with a single tap as they walk in
- Arrival time recorded automatically to the second
- Real-time status badge: **STARTER**, **QUEUE #N**, or **LATE**
- Configurable kickoff time to distinguish on-time arrivals from late ones

### ⚽ Fair Team Draw

| Rule | Behavior |
|------|----------|
| **Play priority** | The first `N × slots_per_team` players to arrive are the starters |
| **Random draw** | Within the starter pool, team assignment is randomized |
| **Goalkeepers** | Not included in the draw — 1st GK → Team A, 2nd GK → Team B… |
| **Entry queue** | Players who didn't fit start a FIFO queue by arrival order |
| **Late arrivals** | Arrived after kickoff → sit out the current game, join end of queue |

Supports **2, 3, or 4 teams** with a configurable number of players per team.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A React project (Vite, Create React App, etc.)

### Installation

```bash
# Clone o repositório
git clone https://github.com/idemar-neto/wo-mgr.git
cd wo-mgr

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```

### Using as a standalone component

`wo-mgr.jsx` is **self-contained** — no external dependencies beyond React. Just drop it into any React project:

```jsx
// App.jsx
import WoManager from './wo-mgr'

export default function App() {
  return <WoManager />
}
```

---

## 🗂️ Project Structure

```
wo-mgr/
├── src/
│   ├── wo-mgr.jsx   # Componente principal (self-contained)
│   └── main.jsx # Componente main
├── public/
│   ├── manifest.webmanifest
│   ├── pwa-192x192.png
│   ├── pwa-512x512.png
│   └── favicon.ico
├── index.html
├── package.json
└── README.md
```

The component is organized into clearly separated sections:

```
wo-mgr.jsx
├── PARSER          — parseList(), stripEmoji(), extractEmoji()
├── TEAM LOGIC      — buildTeams(), TEAM_META
├── CSS             — styles injected via <style> tag (Anton + Outfit fonts)
├── TOAST           — useToast() hook
└── APP             — main component with 3 tabs
```

---

## 🎮 Usage Flow

```
1. "Lista" tab
   └── Paste the group list → click "Processar Lista"

2. "Presença" tab
   ├── Set the kickoff time (optional but recommended)
   ├── Tap "Chegou ✓" for each player as they arrive
   └── Watch the live badges: STARTER / QUEUE #N / LATE

3. "Times" tab
   ├── Choose number of teams and players per team
   ├── Click "Sortear Times" to draw
   └── See: starting teams (randomized) · entry queue · late arrivals
```

---

## 🧠 Draw Logic (in detail)

```
All present players sorted by arrival time (ascending)
              │
              ▼
  ┌──────────────────────────────┐
  │  First N×slots players        │  → Starter pool
  │  (arrived on time)            │    └─ Shuffled randomly
  └──────────────────────────────┘        └─ Distributed across teams
              │
  ┌──────────────────────────────┐
  │  Remaining on-time players   │  → Entry queue (FIFO by arrival)
  └──────────────────────────────┘
              │
  ┌──────────────────────────────┐
  │  Arrived after kickoff        │  → End of queue (late arrivals)
  └──────────────────────────────┘

Goalkeepers (always separate from the draw):
  1st present GK → Team A
  2nd present GK → Team B
  ...
  Additional GKs → GK bench
```

---

## 🎨 Design

- **Orange and black** theme inspired by stadium scoreboards
- Fonts: **Anton** (display) + **Outfit** (body)
- CSS-in-JS via template literal — no styling library required
- Fully responsive for mobile and desktop
- Real-time visual feedback with status badges and toast notifications

---

## 📄 License

MIT — enjoy, and may every game be a good one. ⚽
