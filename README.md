# DSA Notebook

An online-first DSA learning and revision notebook. Write problem notes in
Markdown, connect problems by pattern with tags, search every notebook instantly,
and revise with active recall, spaced repetition and a mistake log.

**Store DSA knowledge → retrieve it fast → revise intelligently → connect
problems and patterns → learn from mistakes.**

## Stack

- Static front end, no build step: vanilla ES modules under `public/`.
- **Firebase Firestore** for persistence, used offline-first (IndexedDB cache;
  writes queue while offline and sync when the connection returns).
- **Firebase anonymous auth** — no visible login wall. Optionally link an
  email + password in Settings to keep notes across devices.
- **Firebase Hosting** for deployment.

## Layout

```
public/                 deployed static app
  index.html            app shell (toolbar, sidebars, dialogs)
  styles.css            night-forest theme + responsive layout
  js/
    app.js              boot, views, sidebars, sync indicator, shortcuts
    fb.js               Firebase init: anonymous auth + offline-first Firestore
    store.js            data layer (one Firestore doc per notebook)
    state.js            in-memory state + derived helpers
    editor.js           block editor (text / heading / code / image / visual)
    sidebar.js          notebook tree in folders
    search.js           notebook-wide search (Ctrl+F)
    meta.js             problem metadata, tags, mistakes, "why does this work?"
    recall.js           Recall Mode (answer first, reveal, grade)
    revise.js           revision sessions (daily / tag / mixed / mistakes)
    ai.js               optional multi-provider AI with ordered fallback
    settings.js         AI providers, revision prefs, backup, shortcuts
    views.js            tag index + dashboard
    palette.js          command palette (Ctrl+K)
    io.js               import / export / legacy migration
    md.js               Markdown-ish rendering + syntax highlighting
    util.js             shared helpers
scripts/sync-public.mjs generates public/llms.md (AI-readable site index)
test/                   node --test suite
firestore.rules         per-user private subtree + public read-only index
```

## Features

- **Notebooks in folders**, autosaved to the cloud, usable offline.
- **Block editor:** Markdown text, headings, dedicated code blocks (language
  select, syntax highlighting, one-click copy, collapse), images, and sandboxed
  visual blocks whose source is stored inside the notebook.
- **Notebook-wide search** (Ctrl+F): current notebook first, then everything
  else, with snippets and next/previous navigation.
- **Tags** for DSA patterns; the tag index shows matching notes and feeds
  pattern-based revision.
- **Problem metadata:** status, knowledge state, difficulty, source, problem
  link, related notebooks.
- **Mistake log** per note, and mistake-focused revision sessions.
- **Recall Mode:** a note becomes a self-test — answer first, reveal, grade.
- **Revision:** daily due list, tag/state sessions, mixed interleaved sessions,
  mistake sessions. Intervals grow with knowledge state.
- **Optional AI** (see below): note-generation prompt, recall questions, answer
  checking, and an AI-built study plan for the day.
- **Command palette** (Ctrl+K), keyboard-first workflow, reading mode.
- **Import/export** Markdown and a one-click migration of the original
  `DSANotes.html` so no existing notes are lost.
- **Responsive:** three-pane on desktop, drawers on tablet and mobile.

## AI (optional)

The notebook works fully without AI. Configure providers in **Settings → AI**:

- Google AI Studio (Gemini)
- Groq
- NVIDIA NIM
- OpenAI, or any OpenAI-compatible endpoint

Providers are tried **in the order you arrange them** — the first one that
answers wins. If every provider fails, you get a report of what went wrong on
each one (key, base URL, model id or rate limit). Keys are stored only in this
browser and sent only to the endpoints you configure; none are bundled with the
app.

Each AI feature carries its own system prompt and attaches its context
automatically (the note, its tags, knowledge state and review history):

- **✦ AI prompt** — a ready-to-copy prompt that asks any AI for a concise
  revision note in this notebook's structure. With a key configured it can also
  generate the note in place.
- **Recall Mode** — AI-written recall questions and per-answer checks.
- **Revision** — an AI study plan for today's queue, interleaved by pattern.

## Develop

```bash
npm install                 # firebase-tools
npm test                    # unit tests
npm run serve               # local hosting preview
npm run sync-public         # regenerate public/llms.md
```

## Deploy

```bash
npm run deploy              # Firebase Hosting + Firestore rules
```

## Data model

Every notebook is one Firestore document under `users/{uid}/notebooks/{id}` —
never one giant document for the whole collection. The folder list and interface
preferences live in the `users/{uid}` profile document. Security rules keep each
authenticated user inside their own subtree.
