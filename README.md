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

## Current core

The editor is centered on one loop: **screen → action → outcomes → preview**.

- A pannable, zoomable, draggable React Flow canvas
- Screen cards showing actual screen/state names, without pretending to render a finished app
- Visible, movable interaction nodes with multiple semantic outcomes
- One screen panel for naming screens, switching/adding states, and adding/selecting actions
- A state-accurate journey simulator with branch selection, history, back, and restart
- A live UX coverage checker for invalid references, missing states or outcomes, unresolved branches, dead ends, mismatched outcome states, and unreachable nodes
- Contextual fixes and guided repairs that immediately rerun analysis
- Undo/redo for document edits and canvas movement, plus keyboard shortcuts, connection handles, search, selection, and screen creation
- Versioned local persistence with structural validation and safe fallback for corrupt drafts
- A serializable, renderer-independent domain model with schema versioning

New browsers start with a complete payment example: success reaches confirmation, while a decline can return to checkout. Existing browser drafts are preserved. **Load example** explicitly asks before replacing the current flow, and that replacement can be undone until the tab closes.

**Preview** tests modeled screen/state transitions and lets you choose outcomes. It does not process payments, make real requests, or generate an interactive production UI. **Check flow** finds structural gaps in what you modeled; it cannot guarantee complete UX coverage.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Try the core loop

1. Select a screen in the outline or use **Add screen**. Give it a name. Open **States** and check the states it supports; click a state's name to show it on the canvas. The **Initial** badge marks the state used when no specific arrival state is chosen.
2. Choose **Add action**, name what the user does, then name each outcome and choose its destination screen and state. New actions are available in all states unless you narrow their scope in advanced settings.
3. Choose **Preview** to focus the start screen on the canvas. Use the bottom tray to choose **Pay**, then **Success** or **Declined**. The canvas follows each step and highlights the path traveled. Use **Back** to try another outcome or **Restart** to return to the start; you can still pan and zoom to explore the graph.
4. Return to the editor. Mark a screen as an ending when the journey should finish there, or add another action to continue it.
5. Open **Check flow** when you want help finding unfinished paths. Drag cards to rearrange them and use **Undo** / **Redo** for edits.
6. Reload to confirm that your flow is restored. Drafts are local to this browser and origin, not synced across devices.

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
    analyze.ts               Pure state-pair graph and coverage analysis
    validate.ts              Saved-document validation boundary
    samples/starter.ts       Small working payment example
    samples/checkout.ts      Larger analyzer test fixture
  features/editor/
    PathloomEditor.tsx       Editor state, history, persistence, and orchestration
    graph.ts                 Domain-to-React-Flow projection
    Inspector.tsx            Screen/action editing and optional flow checks
    SimulationTray.tsx       Ephemeral journey simulation
    components/              Stateful screen previews and custom nodes
tests/domain/                Analysis and document-validation unit tests
tests/editor/                Domain-to-canvas projection unit tests
```

The `ProjectDocument` is authoritative. React Flow nodes and edges are projections of that data, and simulator state stays ephemeral. This keeps the model portable to future renderers, collaboration layers, import/export, and schema migrations.

## Near-term roadmap

First, validate that the basic authoring and preview loop is understandable in manual testing. Freeform screen design, richer conditions, project management, collaboration, auto-layout, and Figma integration remain deferred until that core is solid.

## Reference

The interface mechanics were informed by [adrianhajdin/figma_clone](https://github.com/adrianhajdin/figma_clone). That repository currently has no license file, so Pathloom uses it as design and architecture inspiration rather than copying its source code.
