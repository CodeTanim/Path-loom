# Pathloom

Pathloom is a lightweight design and prototyping workspace for the behavior around screens: user flows, application states, failure modes, and edge cases.

The working product contract, milestone gates, and MVP acceptance criteria live in [docs/SPEC.md](docs/SPEC.md). Product scope is updated there before it is expanded in code.

Traditional prototypes usually connect one static frame to the next. Pathloom treats a product as a state graph, so one action can describe every meaningful outcome:

```text
Checkout
  └─ Pay
      ├─ Success → Confirmation
      ├─ Declined → Payment Error
      ├─ Timeout → Retry
      ├─ Offline → Offline Checkout
      └─ Session Expired → Login
```

> Figma helps you design screens. Pathloom helps you design and debug what happens between and around those screens.

## Current vertical slice

The first working build focuses on a checkout recovery flow and includes:

- A pannable, zoomable, draggable React Flow canvas
- Screen cards with explicit UI states and live miniature previews
- An interaction node with multiple semantic outcomes
- A state debugger for idle, loading, success, empty, error, offline, and unauthorized states
- A journey simulator with branch selection, history, back, and restart
- A live UX coverage checker for missing states, unresolved branches, dead ends, and unreachable nodes
- One-click fixes that update the document and immediately rerun analysis
- Undo/redo, keyboard shortcuts, connection handles, local persistence, search, selection, and screen creation
- A serializable, renderer-independent domain model with schema versioning

The seeded example intentionally starts with three findings. Open **Coverage** to repair them, or choose **Run flow** to walk through each payment outcome.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Validate

```bash
npm run lint
npm test
npx tsc --noEmit
npm run build
```

If Turbopack cannot start its CSS worker in a restricted environment, the equivalent production check is:

```bash
npx next build --webpack
```

## Architecture

```text
src/
  app/                       Next.js shell and metadata
  domain/
    model.ts                 Serializable Pathloom document contract
    analyze.ts               Pure graph and coverage analysis
    samples/checkout.ts      Seeded checkout recovery document
  features/editor/
    PathloomEditor.tsx       Editor state, history, persistence, and orchestration
    graph.ts                 Domain-to-React-Flow projection
    Inspector.tsx            State debugger and coverage fixes
    SimulationTray.tsx       Ephemeral journey simulation
    components/              Stateful screen previews and custom nodes
tests/domain/                Analysis unit tests
```

The `ProjectDocument` is authoritative. React Flow nodes and edges are projections of that data, and simulator state stays ephemeral. This keeps the model portable to future renderers, collaboration layers, import/export, and schema migrations.

## Near-term roadmap

1. Screen-level freeform editing for text, shapes, resize, and reusable stateful components
2. Rich branch conditions, variables, and guards
3. Project/file management and IndexedDB persistence
4. Collaboration with granular shared structures and authenticated rooms
5. Auto-layout, graph minimap, trapped-cycle detection, and richer quick fixes
6. Design-system and Figma import/export adapters

## Reference

The interface mechanics were informed by [adrianhajdin/figma_clone](https://github.com/adrianhajdin/figma_clone). That repository currently has no license file, so Pathloom uses it as design and architecture inspiration rather than copying its source code.
