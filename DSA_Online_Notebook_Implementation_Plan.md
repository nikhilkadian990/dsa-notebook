# DSA Online Notebook — Implementation Plan

## 1. Main Instruction

Transform the current `DSANotes.html` into a lightweight, responsive, online-first DSA learning notebook.

Keep the current core editor, notebook/folder concept, dark night-forest visual identity, Markdown-style writing, headings, visuals, images, import/export, outline, and keyboard-first workflow. Replace the current "save back into this HTML file" model with cloud persistence using Firebase Firestore and offline support.

The product should not feel like a generic notes app. Its main purpose is:

**Store DSA knowledge → make it easy to retrieve → revise it intelligently → connect problems/patterns → learn from mistakes.**

Keep the implementation practical and simple. Do not over-engineer the stack or introduce unnecessary framework complexity.

---

## 2. Storage, Hosting, and Persistence

1. Host the application as a static web app using a suitable free host such as Cloudflare Pages, GitHub Pages, Netlify, or Vercel.

2. Use **Firebase Firestore** as the main database.

3. Use Firestore in an offline-first way so notes remain usable without internet and sync when the connection returns.

4. Remove the current requirement to select or relink `DSANotes.html` for saving.

5. Autosave changes to the local/offline state and synchronize them to Firestore automatically.

6. Keep Markdown/TXT/full-notebook export as a backup mechanism.

7. Use the existing notebook/folder structure as the conceptual model, but store individual notebooks/documents independently rather than placing the whole notebook collection into one giant database document.

8. Authentication should be effectively invisible during normal use. The application should not introduce a visible login wall.

9. The current standalone `DSANotes.html` must remain importable/migratable so the existing notes are not lost during the transition.

---

## 3. DSA Note-Taking Structure

The app should support a consistent DSA problem-note structure, but **do not force the user to manually fill every section**.

A good problem note should support these concepts:

1. Problem / Question

2. Pattern / Trigger

3. Key Observation

4. Invariant / Why it works

5. Approach

6. Example / Dry Run

7. Code

8. Complexity

9. Edge Cases

10. Mistake / Pitfall

11. Remember / Main takeaway

12. Related Problems / Patterns

The existing notes already follow much of this structure, so the implementation should make it easier to produce and revise notes rather than replacing the current writing experience.

---

## 4. AI Note-Generation Prompt Helper

Add a small, easy-to-access **"AI Prompt" / "Generate Note Prompt"** action somewhere appropriate in the editor.

Purpose:

1. The user solves/understands a problem.

2. They click the AI Prompt action.

3. The app gives them a ready-to-copy prompt for ChatGPT, Claude, Gemini, or another AI.

4. The prompt should ask the AI to generate a concise DSA revision note following the notebook's preferred structure.

5. The prompt should be easy to copy with one click.

6. The user can paste the generated answer directly into a new heading/note block.

7. The prompt should explicitly optimize for concise revision notes rather than a long tutorial.

This feature is a **prompt generator**, not a general AI chat interface.

---

## 5. Add Link

Add an **Add Link** button to the editor toolbar alongside the existing editor actions.

It should support:

1. Normal external links.

2. Link text + URL.

3. Opening external links in a new tab.

4. Easy internal notebook links.

Internal linking should be simple: the user should be able to choose another notebook/note from the existing notebook collection rather than manually typing paths or URLs.

Use the same mechanism for links between related DSA topics/problems wherever it feels natural.

---

## 6. Working Find / Search

The current Find functionality should be upgraded into a real notebook-wide search system.

1. `Ctrl+F` opens Find.

2. Do not make the user repeatedly choose a search scope.

3. Show results automatically in this order:
   - Current notebook first.
   - Then other notebooks.

4. Show useful snippets and notebook names for other results.

5. Clicking a result should open the correct notebook and jump to the relevant content.

6. Keep next/previous result navigation.

7. Search should cover headings and note text.

8. Search should later also expose tag-based results through the same interface.

The goal is fast retrieval, not a complicated search configuration screen.

---

## 7. Tags and Pattern Index

Add a lightweight tag system for DSA patterns and topics.

Examples:

`#two-pointers`  
`#sliding-window`  
`#binary-search`  
`#hashing`  
`#greedy`

Requirements:

1. A note can have multiple tags.

2. Tags should be easy to add/edit.

3. Add a **Tags** entry somewhere in the UI where it feels natural, preferably alongside the existing notebook/search/navigation tools.

4. Clicking Tags should show all tags in an organized list.

5. Clicking a tag should show all matching notes/problems in the main area as a result list.

6. Clicking a result opens that notebook and jumps to the corresponding note/content.

7. Integrate tag search into the Find/search experience where useful, without making the normal Find workflow complicated.

The purpose is to let the user revise by **pattern**, not only by notebook/folder.

---

## 8. Recall Mode

Add a dedicated **Recall Mode** for active retrieval practice.

This should turn a note into a short self-test instead of simply displaying the complete answer.

Possible recall points include:

1. What is the pattern/trigger?

2. What is the key observation?

3. What invariant or reasoning makes it work?

4. What is the approach?

5. What is the complexity?

6. What are important edge cases?

7. What is the main thing to remember?

The user should answer first and reveal/check afterward.

---

## 9. AI Support Inside Recall / Revision

Do not build a general-purpose chatbot.

Instead, allow an AI API to be used for small focused learning actions such as:

1. Generating better recall questions from a note.

2. Generating alternate questions for the same concept.

3. Checking the user's recall answer against the note.

4. Giving a concise correction/hint when the answer is weak.

5. Helping generate revision questions for scheduled reviews.

AI should be an optional learning utility inside the revision workflow, not the main interface of the application.

Keep API integration modular so the notebook still works without AI enabled.

---

## 10. Knowledge / Revision Strength

Each problem/note should have a simple knowledge-strength state.

Use a small set such as:

1. Learning

2. Getting Familiar

3. Strong

4. Mastered

This is a **knowledge state**, not a permanent score.

The user should be able to change the state manually, and the revision system can also update/suggest it based on review performance.

---

## 11. Spaced Revision

Use the knowledge state together with revision history rather than forcing one rigid fixed schedule.

The Revision area should support both:

1. **Daily scheduled revision**
   - Show what is due today.
   - Allow the system to generate a review session.

2. **Tag/state-based revision**
   - Example: "Revise all Getting Familiar two-pointer problems."
   - Example: "Give me 10 Strong problems from Arrays."

3. The user can choose which revision mode to use.

4. Review intervals should grow as knowledge becomes stronger, but the exact scheduler can remain simple and adjustable.

5. The system should remember review history so the dashboard can show what is due and what has been reviewed.

6. AI may generate better question sets for a review session when enabled.

The purpose is to support repeated retrieval over time without turning the app into a complicated scheduling system.

---

## 12. Mixed / Interleaved Revision

Add mixed revision as part of the Revision system.

1. The system should be able to mix problems from different tags/topics.

2. A revision session should not always present five problems from the same pattern consecutively.

3. Allow the user to choose a mixed review session from multiple topics/tags/states.

4. The system should favor pattern recognition and choosing an approach, not merely recalling a memorized solution.

---

## 13. Mistake Log

Add a lightweight mistake/pitfall mechanism to problem notes.

A mistake record can contain:

1. What I did wrong.

2. Why I think I made the mistake.

3. What the correct idea was.

4. What I should remember next time.

Mistakes should be reviewable separately.

The Revision section should be able to generate a session focused on previous mistakes.

---

## 14. "Why Does This Work?" Learning Action

Add a small action where applicable that prompts the user to explain the reasoning behind a solution.

Examples:

1. Why does this pointer move?

2. Why is this greedy choice valid?

3. Why does sorted order help?

4. What invariant is maintained?

5. Why is the complexity `O(n)`?

This can be used manually or as an AI-assisted question generator during Recall/Revision.

The purpose is to strengthen understanding rather than memorization.

---

## 15. Problem Metadata and Status

Each DSA problem/note should optionally support:

1. Problem link.

2. Source/platform such as LeetCode, GeeksforGeeks, Striver, etc.

3. Difficulty.

4. Pattern/tag.

5. Knowledge state.

6. Problem status such as:
   - Unsolved
   - Solved
   - Revised
   - Strong

7. Related problems.

The metadata should stay compact and should not turn every note into a giant form.

---

## 16. Code Blocks

Improve code blocks so they feel natural for a DSA notebook.

1. Add a dedicated Code action that does not require manually typing Markdown fences.

2. Let the user select/type the language when creating the block.

3. Provide syntax highlighting.

4. Add one-click Copy.

5. Support collapse/expand for longer blocks where useful.

6. Keep code readable on mobile.

7. Preserve clean Markdown export.

The user should not need to remember or manually enter triple-backtick syntax just to create a code block.

---

## 17. Visual Blocks

Keep the existing Visual block/import capability.

Improve it with:

1. Clear Edit / Re-run controls.

2. Better responsive sizing.

3. A **Open in New Tab** action.

4. Keep the current ability to import an external visual file such as `Sorting_Lab.html`.

5. Preserve the source code inside the notebook so visuals remain part of the notebook rather than becoming broken external dependencies.

6. Make the visual easy to view on both desktop and mobile.

---

## 18. AI-Readable Website

Because the whole notebook website is public, make its content easy for external AI systems and normal web tools to understand.

Create and automatically maintain **one global AI-readable Markdown index file for the entire website**, not one index file per folder.

It should contain:

1. The notebook/site description.

2. A list of all notebook files/pages.

3. A clean title for each notebook.

4. A stable link to each notebook.

5. Optional short descriptions where available.

6. Links to the Markdown-readable version of notebooks where practical.

The file should automatically update whenever notebooks are created, renamed, moved, or deleted.

Use clean semantic HTML and stable URLs so a person or AI system can navigate from the public site to the relevant notebook.

---

## 19. Fully Responsive Design

Responsive behavior is mandatory.

### Desktop

Keep the current three-part structure:

`Notebooks | Main Editor | Outline`

### Tablet

Allow sidebars to collapse into drawers while preserving the editor as the main focus.

### Mobile

Use a mobile-first layout with:

1. Editor as the primary screen.

2. Notebook navigation available through a drawer/sheet.

3. Outline available through a drawer/sheet.

4. Toolbar actions condensed into logical groups.

5. Large enough touch targets.

6. No horizontal overflow.

7. Code, visuals, dialogs, search, and revision screens all responsive.

Do not simply shrink the current desktop layout.

---

## 20. Visual Design / UX Direction

Keep the existing **night-forest** identity.

The intended visual direction is:

**Apple Notes simplicity + VS Code practicality + quiet night/forest atmosphere.**

Do not turn it into a glassmorphism dashboard.

Improve:

1. Spacing.

2. Typography hierarchy.

3. Click/touch targets.

4. Toolbar organization.

5. Reduced visual clutter.

6. Clear primary vs secondary actions.

7. More whitespace around important content.

8. Smooth but restrained transitions.

9. Consistency between editor, search, revision, and dashboard screens.

Keep the current aesthetic recognizable rather than replacing it completely.

---

## 21. Dashboard

Add a lightweight dashboard/home view.

It should not be visually heavy.

Useful information can include:

1. Continue where I left off.

2. Recently edited notebooks.

3. Revision due today.

4. Weak/learning topics.

5. Mistakes to review.

6. Small progress overview.

7. Quick actions:
   - New Notebook
   - Review Today
   - Search
   - Browse Tags

The dashboard should help the user decide what to do next, not become an analytics product.

---

## 22. Small UX Improvements

Keep the following improvements where they fit naturally:

1. Continue from the last opened notebook and approximate reading position.

2. Recently edited notebooks.

3. Reading/Focus mode.

4. Better deletion protection/undo where practical.

5. Strong keyboard shortcut support.

6. A hidden command palette for power-user actions such as:
   - New notebook
   - Search
   - Add link
   - Add visual
   - Start review
   - Toggle reading mode
   - Export

7. The command palette should be discoverable through a shortcut such as `Ctrl/Cmd + K`, but **must not appear as a permanent text block in the sidebar or main interface**.

8. Keep the interface visually quiet when the user is simply reading or writing notes.

---

## 23. Main Navigation Concept

The application should naturally revolve around:

1. **Dashboard**

2. **Notebooks**

3. **Search**

4. **Tags**

5. **Revision**

6. **Settings / Backup**

Do not expose every feature as a large permanent button.

Common tasks should be easy to reach, while less frequent actions can live inside menus, dialogs, the command palette, or contextual controls.

---

## 24. Settings

Provide a small Settings area for:

1. AI configuration/API settings.

2. Revision preferences.

3. Export/backup.

4. Interface preferences.

5. Keyboard shortcuts/help.

Do not make settings central to the normal note-taking experience.

---

## 25. Implementation Order

Build in this order so the project remains stable:

1. Convert persistence from local HTML-file saving to Firestore + offline-first storage.

2. Preserve/migrate the existing notebooks and note content.

3. Make the current editor fully responsive.

4. Add Link and internal linking.

5. Upgrade Find into notebook-wide search.

6. Add tags and tag-based navigation.

7. Improve code blocks and visual blocks.

8. Add problem metadata/status.

9. Add mistake records and "Why does this work?" actions.

10. Add Recall Mode.

11. Add knowledge states and Revision.

12. Add mixed/interleaved revision.

13. Add optional AI support for recall/revision.

14. Add the lightweight dashboard.

15. Add the global AI-readable Markdown index and clean public notebook URLs.

16. Finish UX polish, backup/export testing, and mobile testing.

---

## 26. Final Product Principle

The final application should feel like a personal DSA workspace rather than a generic cloud notes application.

The user should be able to:

**Write notes → connect concepts → search instantly → retrieve from memory → review weak areas → learn from mistakes → revisit patterns → keep everything synced automatically.**

Keep the implementation compact and maintainable. Prioritize the learning workflow and everyday usability over adding unrelated features.
