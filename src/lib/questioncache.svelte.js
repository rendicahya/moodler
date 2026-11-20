// Per-question results that lists need for every question (problems, search text), worked out again only when that
// question changes. Without this, typing one letter re-checked and re-searched every question of the quiz.

import { validateQuestion, stripHtml } from './model.js';

class Cached {
  #q;
  issues = $derived(validateQuestion(this.#q));
  search = $derived([this.#q.name, stripHtml(this.#q.questiontext), ...this.#q.tags].join('\n').toLowerCase());
  constructor(q) {
    this.#q = q;
  }
}

const cache = new WeakMap();

function cached(q) {
  let c = cache.get(q);
  if (!c) cache.set(q, (c = new Cached(q)));
  return c;
}

/** The problems of a question, as validateQuestion gives them. */
export const issuesOf = (q) => cached(q).issues;

/** A question's name, text and tags in lower case, to search in. */
export const searchTextOf = (q) => cached(q).search;
