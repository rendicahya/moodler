// "Improve with AI" for one question: a prompt that sends the question to an AI chatbot as Moodle XML with a task
// (fix it, better distractors, translate, write variations, …), and reading the reply back in.

import { exportMoodleXml, importMoodleXml } from './formats/moodlexml.js';

const DISTRACTOR_TYPES = ['multichoice', 'cloze', 'gapselect', 'ddwtos', 'matching'];

export const TASKS = [
  {
    id: 'improve',
    label: 'Check and improve',
    description: 'Fix mistakes, ambiguity and unclear wording',
    text: 'Review this question and improve it. Fix factual errors, ambiguity, unclear wording, grammar and spelling, and make sure exactly the intended answers are marked correct. Keep what is already good, and do not change what the question tests.',
  },
  {
    id: 'distractors',
    label: 'Better wrong answers',
    description: 'Plausible distractors based on common mistakes',
    types: DISTRACTOR_TYPES,
    text: 'Improve the wrong answers (distractors). Make each one plausible, based on a common mistake or misconception, yet clearly wrong for someone who knows the topic, and similar in length, style and grammar to the correct answer. Keep the question text and the correct answer.',
  },
  {
    id: 'simplify',
    label: 'Simpler language',
    description: 'Shorter sentences and everyday words',
    text: 'Rewrite the question in simpler, clearer language, with shorter sentences and everyday words, without changing what it tests or which answers are correct.',
  },
  {
    id: 'harder',
    label: 'Make it harder',
    description: 'Apply or analyse instead of recall',
    text: 'Make the question harder, so it asks students to apply, analyse or evaluate rather than recall, while testing the same topic. Update the answers and feedback to match.',
  },
  {
    id: 'easier',
    label: 'Make it easier',
    description: 'For students new to the topic',
    text: 'Make the question easier, for students who are just starting on this topic, while testing the same idea. Update the answers and feedback to match.',
  },
  {
    id: 'feedback',
    label: 'Add feedback',
    description: 'Explain the correct answer and each choice',
    text: 'Add feedback without changing the question or its answers: a <generalfeedback> that explains the correct answer and, where the question has answers, a short <feedback> on each answer saying why it is right or wrong.',
  },
  {
    id: 'translate',
    label: 'Translate',
    description: 'Into another language',
    text: (o) =>
      `Translate the question into ${o.language?.trim() || 'English'}: its name, text, answers, feedback and hints. Keep the meaning, the grades and the structure exactly the same.`,
  },
  {
    id: 'variants',
    label: 'Similar questions',
    description: 'New questions that test the same thing',
    adds: true,
    text: (o) =>
      `Write ${o.count} new question${o.count === 1 ? '' : 's'} that test${o.count === 1 ? 's' : ''} the same knowledge or skill as this one, of the same type and difficulty, but different from it${o.count === 1 ? '' : ' and from each other'}: use other examples, numbers or contexts. Do not copy the original question.`,
  },
  {
    id: 'custom',
    label: 'Your own instructions',
    description: 'Describe the change yourself',
    text: '',
  },
];

export const TASK_MAP = Object.fromEntries(TASKS.map((t) => [t.id, t]));

export const tasksFor = (type) => TASKS.filter((t) => !t.types || t.types.includes(type));

/** Calls `fn` on every string in a plain object tree and stores what it returns. */
function mapStrings(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  return value;
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/bmp': 'bmp' };

/**
 * The question as Moodle XML, without its images: they would make the prompt huge, so each becomes a reference like
 * @@PLUGINFILE@@/image1.png, and `images` maps those names back to the pictures.
 */
export function questionXml(q) {
  const images = {};
  let n = 0;
  const { unreviewed, ...rest } = q;
  const plain = mapStrings(rest, (s) =>
    s.replace(/data:([\w/+.-]+);base64,[A-Za-z0-9+/=\s]+/g, (uri, mime) => {
      const name = `image${++n}.${EXT[mime] || 'bin'}`;
      images[name] = uri;
      return `@@PLUGINFILE@@/${name}`;
    })
  );
  const xml = exportMoodleXml({ includeCategory: false }, [plain])
    .text.replace(/^\s*<!-- question: .* -->\n/m, '')
    .trim();
  return { xml, images };
}

/**
 * @param {object} o
 * @param {object} o.q         the question
 * @param {string} o.task      a TASKS id
 * @param {string} [o.language] for "translate"
 * @param {number} [o.count]   for "variants"
 * @param {string} [o.extra]   further instructions (the whole task for "custom")
 */
export function buildImprovePrompt(o) {
  const task = TASK_MAP[o.task] ?? TASKS[0];
  const { xml, images } = questionXml(o.q);
  const count = Math.max(1, Number(o.count) || 1);
  const text = typeof task.text === 'function' ? task.text({ ...o, count }) : task.text;
  const extra = o.extra?.trim();
  const L = ['You are an experienced teacher and assessment writer. Below is a Moodle quiz question in Moodle XML.', ''];

  if (text) L.push(`Task: ${text}`);
  if (extra) L.push(text ? `Also: ${extra}` : `Task: ${extra}`);
  L.push('');

  const rules = [
    task.adds ? 'Use the same question type and the same XML structure as the original.' : 'Keep the question type and the XML structure.',
    'Questions must be factually correct and unambiguous, with a clearly correct answer.',
  ];
  if (task.id !== 'translate') rules.push('Write in the same language as the original question.');
  if (Object.keys(images).length) {
    rules.push(
      task.adds
        ? 'The original contains images written as @@PLUGINFILE@@/… references. Only reuse them where the same picture fits the new question.'
        : 'Keep every image reference such as @@PLUGINFILE@@/image1.png exactly as it is, in the same place.'
    );
  }
  if (o.q.type === 'calculated') rules.push('Keep the {wildcards} in the text and the formulas consistent, with a <dataset_definition> for each; leave out <dataset_items>.');
  if (o.q.type === 'cloze') rules.push('Keep the embedded answers in valid Cloze syntax, such as {1:MULTICHOICE:=right~wrong}.');
  rules.push(
    'Put question text in <![CDATA[ ]]> as simple HTML. Escape any other &, < and > as &amp;, &lt; and &gt;.',
    task.adds ? 'Give each question its own short, descriptive <name>.' : 'Update the <name> if it no longer fits.'
  );
  L.push('Rules:', ...rules.map((r) => `- ${r}`), '');

  L.push(
    'Output:',
    '- First, list in a few short bullet points what you changed and why.',
    `- Then give one complete Moodle XML document in a single code block, starting with <?xml version="1.0" encoding="UTF-8"?> and a <quiz> root element, containing only ${task.adds ? `the ${count === 1 ? 'new question' : `${count} new questions`}` : 'the changed question'}.`,
    '',
    'The question:',
    '',
    '```xml',
    xml,
    '```'
  );
  return { prompt: L.join('\n'), images };
}

/** Reads the questions from an AI reply and puts the images back. Throws when the reply holds no questions. */
export function readReply(text, images = {}) {
  if (!/<quiz[\s>]/.test(text)) throw new Error('No Moodle XML found. Paste the whole reply, including the code block.');
  const { questions, warnings } = importMoodleXml(text);
  if (!questions.length) throw new Error(warnings[0] || 'The reply contains no questions.');
  const restored = questions.map((q) => mapStrings(q, (s) => s.replace(/@@PLUGINFILE@@\/([^"'\s<>)]+)/g, (m, name) => images[name] ?? images[decodeURIComponent(name)] ?? m)));
  return { questions: restored, warnings };
}
