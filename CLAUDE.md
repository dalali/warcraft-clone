# CLAUDE.md

## Project
warcraft-clone — Warcraft 1-style RTS clone, browser-based, 3D units via Three.js. Phase 1: a single simple skirmish mission (one map, basic unit movement/combat).

## Tech Stack
Node.js only + Docker Compose

## Local Setup
```bash
cp .env.example .env   # edit as needed
./run.sh start
```

## Key Commands
- `./run.sh start` — start the app
- `./run.sh test`  — run tests
- `./run.sh logs`  — tail logs
- `./run.sh shell` — container shell

## Rules
- Keep changes minimal and focused
- Run tests before committing
