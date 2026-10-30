# Moodler

A frontend-only web app for creating and editing Moodle quiz questions. It runs entirely in the browser: nothing is uploaded, and your work is saved automatically in the browser (IndexedDB, so quizzes with many images fit).

Built with [Svelte 5](https://svelte.dev) and [Vite](https://vite.dev), and deployed to GitHub Pages at **https://rendicahya.github.io/moodler/**.

## Features

- **Multiple quizzes:** keep as many quizzes as you like in the browser. Every quiz has a tab in the top bar showing its question count: click to switch (or Alt+1–9), double-click to rename, drag to reorder, and right-click to duplicate. Closing a tab (Alt+W) removes that quiz, after asking if it has questions, with an Undo. Each quiz keeps its own undo history and reopens where you left it: the same question, search, list scroll position and ticked questions. Imported files open as a new quiz by default. To move questions to another quiz, drag them onto its tab (hold Ctrl to copy), or hold them over the tab until it opens and drop them at the place you want; ticked questions go together, and there is an Undo.
- **Question types:** multiple choice (single or multiple answers), true/false, short answer, numerical (with units), essay, matching, embedded answers (Cloze), select missing words, drag and drop into text, ordering, and description.
- **Import:** Moodle XML, GIFT (including missing-word), Aiken, Embedded answers (Cloze), and the editor's own JSON project format. Upload a file or paste text. The format is detected automatically. Pasting questions anywhere outside a text field opens the import dialog with them.
- **Generate with AI:** the AI prompt builder (sparkle button or Alt+G) writes a prompt for ChatGPT, Claude, Gemini or another chatbot. Choose the topic, how many questions of each type, difficulty, language and students, and optionally paste source material. The prompt asks for Moodle XML with an example of each chosen type, so the reply can be pasted straight back into Moodler. Replies wrapped in a code block or surrounded by text import fine.
- **Export:** Moodle XML (full fidelity, including embedded images, hints, tags and categories), GIFT, Aiken and JSON. Export the whole quiz or only the questions you tick. Before you download, the export dialog lists every question with problems (such as an empty question text or no correct answer), with a Fix button that opens it; the warning count in the question list jumps to the next one. Any questions a format can't represent are listed as warnings.
- **Editing:** a rich-text editor with image paste and drop, HTML source view and TeX insertion. You can edit per-answer grades and feedback, combined feedback, hints, tags, penalties, ID numbers and category overrides.
- **Live preview:** show the editor only, the student-view preview only, or both side by side, updating as you type (switch with Alt+P). Drag the divider to resize. On narrow screens they switch to tabs.
- **Navigation:** step through questions with the Previous / Next buttons in the question toolbar or Alt+Page Up / Page Down (Alt+Home / End for the first / last), without going back to the list.
- **Guidance:** required fields are marked with *, optional ones are labelled, and tooltips explain Moodle terms such as default mark, penalty per wrong try and question bank category.
- **Reordering:** drag and drop questions, answers, matching pairs, choices and ordering items, or shuffle multiple-choice answers with one click.
- **Cloze builder:** insert or edit gaps through a form. You don't need to memorise the syntax.
- **Preview:** a "show correct answers" toggle highlights the right responses. Preview the whole quiz in order with Alt+Q.
- **Overview:** the question list shows how many questions of each type the quiz has.
- **Bulk actions:** tick several questions in the list (hover a number, Ctrl+click or Shift+click) to export, move, duplicate or delete them, or to change their mark, penalty, tags, category or visibility in one go.
- **Backups:** after many changes Moodler reminds you to back up, and the save status in the header turns into a "Back up" button that downloads a JSON backup of all your quizzes in one click. Import that file to restore them.
- **Offline:** after the first visit the app works without a connection and can be installed from the browser's menu.
- **Print / PDF:** print a paper version of the quiz (Ctrl+P) with answer circles, blank lines and name/ID fields. Correct answers can be hidden, marked in place, or listed in an answer key at the end. Use "Save as PDF" in the print dialog to get a PDF.
- **Find and replace:** search and replace text in every question at once (Ctrl+H), with match-case and whole-word options. Only the visible text is changed, never images, links or HTML tags.
- **Productivity:** undo/redo, validation warnings, search, keyboard shortcuts, and per-quiz defaults.
- **UI:** light and dark themes, a fullscreen toggle and a responsive layout. Hide or show the question list with the small tab on its edge, and drag its edge to resize it.

## Development

```bash
npm install
npm run dev      # start the dev server
npm test         # run format round-trip tests
npm run build    # production build in dist/
```

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys the site on every push to `main`. To enable it, go to **Settings → Pages** in your repository and set **Source** to **GitHub Actions**.

The build uses a relative base path, so it works under any repository name.

## Importing into Moodle

In your course, go to **Question bank → Import**, choose the same format you exported (for example *Moodle XML format*) and upload the file. To have Moodle create the category from the file, enable **Get category from file**.
