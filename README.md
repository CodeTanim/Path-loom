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
- Editable yellow sticky notes: drag the header to move, drag the corner to resize, and undo/redo changes
- Screen cards showing actual screen/state names, without pretending to render a finished app
- Visible, movable interaction nodes with multiple semantic outcomes
- One screen panel for naming screens, switching/adding states, and adding/selecting actions
- A state-accurate journey simulator with branch selection, history, back, and restart
- Saved, state-aware exploration progress with an outcome checklist, unexplored arrow labels, and a guided next-outcome shortcut
- Outcome-level Needs work flags with autosaved review notes, revisit shortcuts, and explicit Resolve/Reopen
- A live UX coverage checker for invalid references, missing states or outcomes, unresolved branches, dead ends, mismatched outcome states, and unreachable nodes
- Contextual fixes and guided repairs that immediately rerun analysis
- Undo/redo for document edits and canvas movement, plus keyboard shortcuts, connection handles, search, selection, and screen creation
- Versioned local persistence with structural validation that preserves unreadable drafts
- A serializable, renderer-independent domain model with schema versioning
- A project dashboard with blank flows, examples, search, rename, and duplicate
- Optional Clerk sign-in and private Neon cloud projects, with local-first saves and conflict protection

New browsers start on **Your flows**. Create a blank flow or try the payment example: success reaches confirmation, while a decline can return to checkout. Existing browser drafts migrate into the dashboard; the original saved draft is retained as a backup. Each project has an independent editor URL. **Load example** asks before replacing the current flow and can be undone until the tab closes.

**Preview** tests modeled screen/state transitions and lets you choose outcomes. It does not process payments, make real requests, or generate an interactive production UI. **Check flow** finds structural gaps in what you modeled; it cannot guarantee complete UX coverage.

**Flow review** starts as a compact canvas bar showing exploration progress and open flags. Click it to open the review tools; click it again, press Escape within the panel, or click outside to collapse it. The details remain readable without permanently covering the canvas.

**Flow review** remembers which outcome checks you have followed in Preview. An action available in multiple reachable states has separate checks for those states. **Explore next outcome** jumps to the relevant source state and action; only choosing an outcome and reaching its destination counts. Broken or unreachable outcomes stay visible as needing attention. Back, Restart, and reopening keep valid progress. Relevant screen, state, action, or destination edits reset affected checks; layout, arrow routes, and sticky notes do not. Exploration is not approval, and completing the count does not guarantee a complete or correct experience.

During Preview, flag an outcome as **Needs work** before choosing it or after seeing its result. Add an optional note; edits save as you type. Flow review keeps these findings separate from exploration and structural issues. **Revisit** opens the recorded source state and highlights that outcome without counting a traversal. If that context is no longer available, **Show in editor** takes you to the outcome instead. **Resolve** closes a finding while retaining its note, and **Reopen** brings it back. Neither action approves the flow. One flag applies to the whole outcome; the recorded state supplies review context. Notes survive flow edits and unrelated design Undo. Deleting their outcome removes them; Undo can restore them. This increment supports 200 findings per project and 1,000 characters per note.

Right-click an empty part of the canvas and choose **Add sticky note** to place a note there, or use the sidebar button to add one in your current view. Neither action changes your pan or zoom; notes near an edge are kept visible where possible. Type directly on the note; its text, position, and size save with the project. Select a note to reveal its resize corner (also keyboard-accessible with arrow keys). Notes are separate from screens, never create flow-check findings, and are hidden during Preview.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Try the core loop

Start with **Try an example** on the dashboard, then:

1. Select a screen in the outline or use **Add screen**. Give it a name. Open **States** and check the states it supports; click a state's name to show it on the canvas. The **Initial** badge marks the state used when no specific arrival state is chosen.
2. Choose **Add action**, name what the user does, then name each outcome and choose its destination screen and state. New actions are available in all states unless you narrow their scope in advanced settings.
3. Choose **Preview** to focus the start screen on the canvas. Use the bottom tray to choose **Pay**, then **Success** or **Declined**. The canvas follows each step and highlights the path traveled. Use **Back** to try another outcome or **Restart** to return to the start; you can still pan and zoom to explore the graph.
4. Use **Explore next outcome** to jump to an untried choice. The payment example has three outcome checks: Success, Declined, and Return to checkout. Progress is saved with the project. Return to the editor to see the checklist; mark a screen as an ending when the journey should finish there, or add another action to continue it.
5. Open **Check flow** when you want help finding unfinished paths. Drag cards to rearrange them and use **Undo** / **Redo** for edits.
6. Use the Pathloom back button to return to **Your flows**. Rename or duplicate your project, then reopen it. Reload to confirm persistence. Guest drafts belong to this browser and origin.

## Optional login and cloud saving

Guest mode needs no services or credentials. The account integration is Clerk;
project storage is Neon Postgres. No AI feature is included in this milestone.

To enable cloud saving, configure your own Clerk application and Neon database.
Add these values to an ignored `.env.local` file (never commit secrets):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key for this environment |
| `CLERK_SECRET_KEY` | Matching Clerk secret key; server only |
| `DATABASE_URL` | Neon Postgres connection string; server only |

Configure the Clerk application's allowed development/production origins for
the URL you use. Pathloom supplies `/sign-in` and `/sign-up` routes. Select your
desired email/social sign-in methods in Clerk; Pathloom does not manage passwords.

Run `npm run db:migrate` to create the project table, then restart the app.
For production, set the same variables on the deployment before building; the
publishable key is embedded in the client build. Use matching production keys.

Sign in, open a guest project, and choose **Save online**. This copies the draft
into your account while retaining the guest backup. Further editor changes save
in the browser immediately and sync after a short pause. Online status is shown
only after the server acknowledges the save. Network errors expose retry;
revision conflicts preserve the local edits and offer **Save a copy** rather
than overwriting another version. Unsynced account edits remain available on
this device after reopening under the same account. Guest backups do not update
when the online copy changes.

Account data is separated by user ID in browser storage and every server query
uses the authenticated owner. Signing out hides the account's cached projects;
it does not erase that browser cache. Avoid shared-device access to browser
storage for sensitive projects. This release does not include deletion,
sharing, collaboration, or account-data export.

Without Clerk keys, the app explicitly stays in guest mode. With Clerk but no
database, sign-in works but projects remain browser-only. Live sign-in,
cross-device persistence, and real database migration require your service
configuration and have not been verified in the credential-free environment.

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
    exploration.ts           State-aware outcome checks and semantic progress invalidation
    validate.ts              Saved-document validation boundary
    samples/starter.ts       Small working payment example
    samples/checkout.ts      Larger analyzer test fixture
  features/editor/
    PathloomEditor.tsx       Editor state, history, persistence, and orchestration
    graph.ts                 Domain-to-React-Flow projection
    Inspector.tsx            Screen/action editing and optional flow checks
    SimulationTray.tsx       Ephemeral journey simulation
    ExplorationPanel.tsx    Persistent review progress and guided next-outcome entry
    components/              Stateful screen previews and custom nodes
  features/projects/         Dashboard, local library, migration, and cloud sync
  features/account/          Optional Clerk provider and account controls
  lib/server/                Authenticated, validated, owner-scoped database access
  app/api/projects/          Private project list/create/read/update endpoints
db/001_projects.sql          Idempotent cloud schema migration
tests/domain/                Analysis and document-validation unit tests
tests/editor/                Domain-to-canvas projection unit tests
tests/projects/              Local persistence, migration, and sync safety tests
tests/cloud/                 Auth, request-validation, and API ownership tests
```

The `ProjectDocument` is authoritative. React Flow nodes and edges are projections of that data. The current simulator cursor and journey stay ephemeral; versioned exploration visits are saved with the project and reconciled against semantic fingerprints. This keeps the model portable to future renderers, collaboration layers, import/export, and schema migrations.

## Near-term roadmap

Validate the project dashboard and the basic authoring/preview loop in manual testing. Configure and verify real login and cross-device saving before shipping cloud access. AI is postponed; freeform screen design, richer conditions, collaboration, auto-layout, and Figma integration remain deferred.

## Reference

The interface mechanics were informed by [adrianhajdin/figma_clone](https://github.com/adrianhajdin/figma_clone). That repository currently has no license file, so Pathloom uses it as design and architecture inspiration rather than copying its source code.
