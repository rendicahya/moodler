// Minimal drag-and-drop list reordering built on native HTML5 DnD.
// Usage:
//   const sort = createSortable((from, to) => moveItem(list, from, to));
//   <div {...sort.item(i)}> <button {...sort.handle(i)}>⠿</button> ... </div>

export function createSortable(onMove) {
  const state = $state({ from: -1, over: -1, after: false });
  const token = Math.random().toString(36).slice(2);

  function reset() {
    state.from = -1;
    state.over = -1;
  }

  return {
    get dragging() {
      return state.from;
    },
    /** Returns 'before' | 'after' | null for drop-indicator styling. */
    indicator(i) {
      if (state.from === -1 || state.over !== i) return null;
      const target = state.after ? i + 1 : i;
      if (target === state.from || target === state.from + 1) return null;
      return state.after ? 'after' : 'before';
    },
    handle(i) {
      return {
        draggable: 'true',
        ondragstart: (e) => {
          state.from = i;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/x-sortable', token);
          const row = e.currentTarget.closest('[data-sortable-item]');
          if (row) {
            const r = row.getBoundingClientRect();
            e.dataTransfer.setDragImage(row, e.clientX - r.left, e.clientY - r.top);
          }
        },
        ondragend: reset,
      };
    },
    item(i) {
      return {
        'data-sortable-item': '',
        ondragover: (e) => {
          if (state.from === -1) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const r = e.currentTarget.getBoundingClientRect();
          state.over = i;
          state.after = e.clientY > r.top + r.height / 2;
        },
        ondrop: (e) => {
          if (state.from === -1) return;
          e.preventDefault();
          let to = state.after ? i + 1 : i;
          if (to > state.from) to--;
          const from = state.from;
          reset();
          if (to !== from) onMove(from, to);
        },
      };
    },
  };
}
