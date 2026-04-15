# ZeroCollab

ZeroCollab is a React + Vite collaboration platform focused on team productivity with realtime syncing and offline-first storage.

## Core Features

- Authentication and account flows
- Workspace management (projects, teams, invitations)
- Kanban task tracking
- Calendar with task and meeting views
- Team chat with file transfer and calls
- Meetings and evaluation modules
- IndexedDB-backed local persistence and P2P sync

## Tech Stack

- React 19
- Vite 7
- ESLint 9
- Supabase
- PeerJS
- Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 20+ (recommended)
- npm

### Install

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Run Lint Checks

```bash
npm run lint
```

## Project Notes

- Build artifacts (`dist`, `dev-dist`) and dependency folders (`node_modules`) are ignored from repository workflow.
- Keep environment values in local `.env` files and do not commit secrets.
