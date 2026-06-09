# ZeroCollab — P2P Project Management and Assessment Tool

> **Capstone Project**
> **ZeroCollab: P2P Project Management and Assessment Tool**
> Istanbul Kültür University
>
> **Submitted by**
> - Songül Nur Öztürk — 2100004806
> - Özlem Nur Bora — 1900003285
> - Nisanur Karataş — 2100004398
>
> **Project Advisor:** Yusuf Altunel

---

## Overview

ZeroCollab is a collaborative project-management and assessment platform built for agile teams. It combines a full Scrum/Kanban workflow (backlog → roadmap → sprint planning → sprint board) with real-time team communication, an auditable activity history, an offline-first experience, AI-assisted work-item drafting, LLM-based evaluation, and a token-based economy for resource quotas.

Peer-to-peer (P2P) communication is a defining pillar of ZeroCollab: team chat, file transfer, voice/video calls, and live collaboration updates travel **directly between browsers over WebRTC**, with no central server relaying that traffic. The application is also offline-first — data is persisted locally in the browser via IndexedDB and synchronized through Supabase, which serves as the durable store for shared project data.

---

## Key Features

**Workspace & access**
- Projects and teams with invitations (invite by email or join a team with a code)
- Role-based membership (owner / admin / member) and role audit logging

**Agile workflow**
- Product Backlog with Epics, Features, User Stories, and Tasks
- Product Roadmap with Now / Next / Later prioritization and release packages
- Sprint Planning and a drag-and-drop Sprint Board with a burndown chart
- Kanban Tasks board (To Do / In Progress / In Review / Done) with per-card history

**Planning**
- Calendar with personal, general (shared), and custom calendars, plus meetings and due-date tracking

**Peer-to-peer collaboration (WebRTC)**
- Real-time team chat over direct browser-to-browser data channels (no server stores or relays messages)
- Peer-to-peer file transfer between members
- Voice and video calls between peers
- Live propagation of collaboration updates directly between connected peers
- Stable per-user peer identity with automatic reconnection

**Tracking & insight**
- Activity Log: an auditable, member-synced history of project events
- Notifications derived from the activity log (assignments, card moves/edits, meetings, sprints, evaluations) — account-scoped and excluding your own actions
- Dashboard and Project Overview with team workload and progress metrics

**Intelligence & economy**
- AI Auto-Fill to draft work-item details from a title
- LLM-powered evaluation of project deliverables against ontology-defined criteria
- A semantic layer defined in Turtle/RDF ontology files (`public/ontology/*.ttl`) covering the Kanban schema, token tiers, and evaluation rubric
- Hedera-based token economics with tier-based quotas (e.g., team member limits)

**Platform**
- Offline-first Progressive Web App (service worker + IndexedDB) with an offline banner and automatic sync on reconnect
- Light / dark theme

---

## Tech Stack

- **Frontend:** React 19, Vite 7, React Router 7, Tailwind CSS 4
- **Backend / sync:** Supabase (authentication, PostgreSQL, row-level security)
- **Peer-to-peer:** PeerJS / WebRTC (chat, file transfer, calls) with a WebSocket signaling server for peer discovery
- **Local storage:** IndexedDB (via `idb`) for offline-first persistence
- **PWA:** `vite-plugin-pwa` + Workbox service worker
- **Token economics:** Hedera Hashgraph
- **AI:** Anthropic API (Claude) for auto-fill and evaluation
- **Semantic layer:** ontology definitions in Turtle/RDF (`.ttl`), loaded client-side
- **Testing:** Vitest + Testing Library
- **Tooling:** ESLint 9

---

## Architecture (at a glance)

- **Offline-first client:** the React app reads and writes to IndexedDB first, so it remains usable offline. Shared data is synchronized to Supabase, which acts as the central source of truth and enforces access with row-level security.
- **Peer-to-peer layer:** chat messages, file transfers, calls, and live collaboration updates are exchanged **directly between browsers** via WebRTC, established with [PeerJS](https://peerjs.com/). Each client holds a stable peer identity and opens reliable data channels to other peers; media calls use WebRTC media streams. The bundled signaling server (a lightweight WebSocket service) is used **only** for peer discovery / room coordination — it never sees or relays user data.
- **Activity & notifications:** project events are written to an activity log that is synchronized across members; notifications are derived from this log on each client and scoped to the signed-in account.
- **Evaluation & ontology:** assessment criteria are defined in Turtle/RDF ontology files (`public/ontology/*.ttl`) that are loaded in the client; the LLM evaluation uses these definitions to assess deliverables and produce structured feedback.

---

## Getting Started

### Prerequisites

- Node.js 20+ (recommended)
- npm
- A Supabase project (free tier is sufficient)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root with your Supabase credentials:

```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

> The token-economics module uses additional Hedera configuration. See `.env.hedera.example` for the expected variables and copy/fill it as needed.
>
> **Never commit real secrets.** `.env` is git-ignored.

### 3. Set up the database (required)

The app will not function correctly until the Supabase schema is created. Apply every SQL migration in `supabase/migrations/` to your Supabase project, in filename (timestamp) order. You can do this either way:

- **Supabase SQL Editor:** open each migration file and run its SQL, oldest first, or
- **Supabase CLI:**

```bash
supabase db push
```

These migrations create the tables the app depends on (projects/teams membership, tasks, sprints, evaluations, activity logs, release packages, and more) together with their row-level-security policies.

### 4. Run the development server

```bash
npm run dev
```

The app will be available at the URL printed by Vite (typically `http://localhost:5173`).

---

## Production Build & Offline (PWA)

Because ZeroCollab is a PWA, offline behavior is only available from a production build (the service worker is not served by the dev server):

```bash
npm run build
npm run preview
```

Open the previewed URL, then you can verify offline-first behavior (e.g., via your browser DevTools "Offline" mode): the offline banner appears, locally stored data remains available, and changes sync back to Supabase once connectivity is restored.

---

## Peer-to-Peer (P2P) Communication

P2P is central to ZeroCollab. Rather than routing team communication through a central server, browsers talk to each other **directly** over WebRTC, established and managed with [PeerJS](https://peerjs.com/).

**How it works**

- **Peer identity:** every client is assigned a stable peer ID (derived from a locally stored base ID), visible under *Settings → P2P Connection*. The same identity is reused across sessions, and the client automatically reconnects if the connection drops.
- **Data channels:** ZeroCollab opens *reliable* WebRTC data connections between peers. Messages can be sent to a single peer or broadcast to all connected peers. These channels carry team chat, file transfers, and live collaboration updates — none of this traffic passes through a server.
- **Media calls:** voice/video calls are placed peer-to-peer using WebRTC media streams (PeerJS `call`), with incoming calls surfaced to the recipient.
- **Discovery:** before two browsers can connect directly, they need to find each other. That is the only job of the signaling server below.

### Signaling Server (peer discovery)

The `signaling-server/` folder contains a small **WebSocket** server that performs **room-based peer discovery**: peers join a room with `join-room`, and the server broadcasts the current `room-peers` list so each browser learns the others' peer IDs and can open direct WebRTC connections. The signaling server only coordinates discovery — it does **not** carry chat, files, or call media.

**Run locally**

```bash
cd signaling-server
npm install
node server.js
```

It listens on `PORT` (default **3001**).

**Deploy**

Deploy the `signaling-server/` folder as its own service (for example on Railway, with this folder set as the root directory). Point the client at the deployed signaling endpoint as appropriate for your environment.

---

## Available Scripts

```bash
npm run dev      # start the Vite dev server
npm run build    # production build
npm run preview  # preview the production build (required for PWA/offline)
npm run lint     # run ESLint checks
npm test         # run the test suite (Vitest)
npm run test:run # run tests once (CI mode)
npm run test:coverage  # run tests with coverage
```

---

## Project Structure

```
ZeroCollab/
├── src/
│   ├── pages/            # route-level pages (Dashboard, Backlog, Roadmap, Sprints, Chat, ...)
│   ├── components/       # UI components (kanban, backlog, workspace, notifications, settings, ...)
│   ├── layouts/          # app shell / sidebar layout
│   ├── utils/            # Supabase client, IndexedDB, P2P, services, token economics, contexts
│   └── ...
├── supabase/
│   └── migrations/       # SQL schema migrations (run these on your Supabase project)
├── signaling-server/     # WebSocket signaling server for WebRTC peer discovery
├── public/
│   ├── ontology/         # Turtle/RDF (.ttl) ontology files (Kanban schema, token tiers, evaluation)
│   └── ...               # other static / PWA assets
└── ...
```

Unit tests live alongside the code they cover, in `__tests__/` folders (run with `npm test`).

---

## Notes

- Secrets live only in local environment files (`.env`); they are git-ignored and must not be committed.
- Build artifacts (`dist`, `dev-dist`) and dependencies (`node_modules`) are excluded from version control.
- Real-time, multi-user features (sync, activity log, notifications, P2P chat) require all participants to be running an up-to-date build and to have the Supabase migrations applied.
