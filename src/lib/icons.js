import {
  ListChecks,
  ToggleLeft,
  TextCursorInput,
  Hash,
  FileText,
  GitCompareArrows,
  Braces,
  ListCollapse,
  Move,
  ListOrdered,
  Info,
} from '@lucide/svelte';

export const TYPE_ICONS = {
  multichoice: ListChecks,
  truefalse: ToggleLeft,
  shortanswer: TextCursorInput,
  numerical: Hash,
  essay: FileText,
  matching: GitCompareArrows,
  cloze: Braces,
  gapselect: ListCollapse,
  ddwtos: Move,
  ordering: ListOrdered,
  description: Info,
};
