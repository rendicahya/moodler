# Moodler

A frontend-only web app for creating and editing Moodle quiz questions. It runs entirely in the browser: nothing is uploaded, and your work is saved automatically to local storage.

Built with [Svelte 5](https://svelte.dev) and [Vite](https://vite.dev), and deployed to GitHub Pages at **https://rendicahya.github.io/moodler/**.

## Features

- **Question types:** multiple choice (single or multiple answers), true/false, short answer, numerical (with units), essay, matching, embedded answers (Cloze), select missing words, drag and drop into text, ordering, and description.
- **Import:** Moodle XML, GIFT (including missing-word), Aiken, Embedded answers (Cloze), and the editor's own JSON project format. Upload a file or paste text. The format is detected automatically.
- **Export:** Moodle XML (full fidelity, including embedded images, hints, tags and categories), GIFT, Aiken and JSON. Any questions a format can't represent are listed as warnings.
- **Editing:** a rich-text editor with image paste and drop, HTML source view and TeX insertion. You can edit per-answer grades and feedback, combined feedback, hints, tags, penalties, ID numbers and category overrides.
- **Live preview:** the editor and a student-view preview sit side by side and update as you type. Drag the divider to resize, or hide the preview with Alt+P. On narrow screens they switch to tabs.
- **Guidance:** required fields are marked with *, optional ones are labelled, and tooltips explain Moodle terms such as default mark, penalty per wrong try and question bank category.
- **Reordering:** drag and drop questions, answers, matching pairs, choices and ordering items.
- **Cloze builder:** insert or edit gaps through a form. You don't need to memorise the syntax.
- **Preview:** a "show correct answers" toggle highlights the right responses.
- **Productivity:** undo/redo, validation warnings, search, keyboard shortcuts, and per-quiz defaults.
- **UI:** light and dark themes, a fullscreen toggle and a responsive layout.

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
