import { importMoodleXml, exportMoodleXml } from './moodlexml.js';
import { importGift, exportGift } from './gift.js';
import { importAiken, exportAiken } from './aiken.js';
import { importClozeText } from './cloze.js';

export const FORMATS = [
  {
    id: 'xml',
    label: 'Moodle XML',
    ext: 'xml',
    mime: 'application/xml',
    description: 'Full fidelity. Supports every question type, images, hints, tags and categories.',
    import: importMoodleXml,
    export: exportMoodleXml,
  },
  {
    id: 'gift',
    label: 'GIFT',
    ext: 'txt',
    mime: 'text/plain',
    description: 'Text format for multiple choice, true/false, short answer, numerical, matching, essay and description.',
    import: importGift,
    export: exportGift,
  },
  {
    id: 'aiken',
    label: 'Aiken',
    ext: 'txt',
    mime: 'text/plain',
    description: 'Simple text format for single-answer multiple choice questions only.',
    import: importAiken,
    export: exportAiken,
  },
  {
    id: 'cloze',
    label: 'Embedded answers (Cloze)',
    ext: 'txt',
    mime: 'text/plain',
    description: 'Imports the whole text as one Cloze question.',
    import: importClozeText,
    export: null,
  },
  {
    id: 'json',
    label: 'Project (JSON)',
    ext: 'json',
    mime: 'application/json',
    description: 'This editor’s own format. Saves the whole quiz exactly as it is. Full backups of all quizzes use it too.',
    import: (src) => {
      const data = JSON.parse(src);
      // A full backup holds several quizzes; each is restored as its own quiz.
      if (Array.isArray(data?.quizzes)) {
        const quizzes = data.quizzes.filter((q) => Array.isArray(q?.questions));
        return { quiz: {}, quizzes, questions: quizzes.flatMap((q) => q.questions), warnings: [] };
      }
      if (!data || !Array.isArray(data.questions)) throw new Error('Not a quiz project file.');
      const { questions, ...quiz } = data;
      return { quiz, questions, warnings: [] };
    },
    export: (quiz, questions = quiz.questions) => ({ text: JSON.stringify({ app: 'moodler', version: 1, ...quiz, questions }, null, 2), warnings: [] }),
  },
];

export const FORMAT_MAP = Object.fromEntries(FORMATS.map((f) => [f.id, f]));

/**
 * Decides whether clipboard text is worth offering as an import: it must parse into at least one real question.
 * Any plain text parses as a GIFT description, so descriptions alone don't count.
 */
export function looksLikeQuestions(text) {
  if (!text || !text.trim()) return false;
  try {
    const { questions } = FORMAT_MAP[detectFormat(text)].import(text);
    return questions.some((q) => q.type !== 'description');
  } catch {
    return false;
  }
}

/** Best-effort guess of the format of pasted or uploaded text. */
export function detectFormat(text, filename = '') {
  const t = text.replace(/^﻿/, '').trimStart();
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'xml' || t.startsWith('<?xml') || /^<quiz[\s>]/.test(t)) return 'xml';
  // Moodle XML pasted from an AI chat, inside a code block or after a sentence.
  if (/<quiz[\s>][\s\S]*<\/quiz>/.test(t)) return 'xml';
  if (ext === 'json' || t.startsWith('{"') || /^\{\s*"/.test(t)) return 'json';
  if (/^\s*ANSWER\s*:\s*[A-Z]\s*$/im.test(t) && /^\s*[A-Z][.)]\s+/m.test(t)) return 'aiken';
  if (/\{\d*:(SHORTANSWER|SA|MW|NUMERICAL|NM|MULTICHOICE|MC|MULTIRESPONSE|MR)[A-Z_]*:/.test(t) && !/^::/m.test(t)) return 'cloze';
  return 'gift';
}
