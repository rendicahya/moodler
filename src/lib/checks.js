// The warnings of the Check dialog in one list, for the count on the Check button and the notes in Export.
import { answerKeyReport, findDuplicates, placeProblem, answerProblems, imagesWithoutAlt } from './quality.js';
import { htmlClutter } from './cleanhtml.js';

const s = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * What the Check dialog warns about in these questions, as [{ id, count, text }]. `count` is how many things the
 * warning is about (questions, pictures, sets of repeats); review progress is left out, as it is a task, not a fault.
 */
export function checkWarnings(questions) {
  const list = [];
  const add = (id, count, text) => count && list.push({ id, count, text });
  const key = answerKeyReport(questions);
  add('key', key.skewed ? 1 : 0, 'The correct answers of the multiple-choice questions are not spread evenly over the positions.');
  add('longest', key.longSkew ? key.longest.length : 0, `The correct answer is clearly the longest in ${key.longest.length} multiple-choice questions, which gives it away to students.`);
  const placed = questions.filter(placeProblem).length;
  add('place', placed, `${s(placed, 'question has', 'questions have')} an answer like “All of the above” that may not stay in its place.`);
  const problems = questions.map(answerProblems);
  const same = problems.filter((p) => p.some((x) => x.kind === 'same')).length;
  add('same', same, `${s(same, 'question has', 'questions have')} two or more answers that are exactly the same.`);
  const empty = problems.filter((p) => p.some((x) => x.kind === 'empty')).length;
  add('empty', empty, `${s(empty, 'question has', 'questions have')} an empty answer.`);
  const pictures = questions.reduce((n, q) => n + imagesWithoutAlt(q).length, 0);
  add('alt', pictures, `${s(pictures, 'picture has', 'pictures have')} no description for screen readers.`);
  const cluttered = questions.filter((q) => htmlClutter(q).length).length;
  add('html', cluttered, `${s(cluttered, 'question has', 'questions have')} unnecessary HTML attributes or styles (from Word, Google Docs or AI chats).`);
  const dupes = findDuplicates(questions.map((q) => ({ id: q.id, quizId: '', q }))).length;
  add('repeats', dupes, `${s(dupes, 'set', 'sets')} of questions repeat each other.`);
  return list;
}
