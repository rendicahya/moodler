<script>
  import { onMount, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { Cloud, CloudUpload, CloudDownload, LogIn, LogOut, Trash2, Folder, FolderPlus, FilePlus, Pencil, ChevronRight, Check, X, History, Undo2, FileText, FileDown, Search, CircleCheck, CircleDot } from '@lucide/svelte';
  import { FORMATS } from '../../lib/formats/index.js';
  import { normalizeQuiz, setNeedsReview } from '../../lib/model.js';
  import { downloadText, slugify } from '../../lib/download.js';
  import Modal from '../ui/Modal.svelte';
  import { app, library, closeModal, notify, ask, prepareCloudUpload, markCloudSynced, applyCloudQuiz, quizFromXmlFile, renameCloudCopy, blankQuizForCloud, setStoredQuizReview } from '../../lib/store.svelte.js';
  import { uploadChanges } from '../../lib/cloudsync.svelte.js';
  import ContextMenu from '../ui/ContextMenu.svelte';
  import {
    watchUser,
    signIn,
    signOut,
    listCloudQuizzes,
    listCloudFolders,
    listSearchTexts,
    uploadCloudQuiz,
    downloadCloudQuiz,
    deleteCloudQuiz,
    createCloudFolder,
    updateCloudFolder,
    moveCloudQuiz,
    renameCloudQuiz,
    deleteCloudFolders,
    trashCloudItem,
    restoreCloudItem,
    cloudView,
    quizVersions,
    daysLeft,
    matchQuiz,
    searchText,
    folderPath,
    childFolders,
    folderTreeIds,
    folderOptions,
    cloudErrorMessage,
    needsReview,
    KEEP_VERSIONS,
    TRASH_DAYS,
  } from '../../lib/cloud.js';

  // The tree's row for the trash; folder IDs never look like this.
  const TRASH = ':trash';

  let ready = $state(false);
  let user = $state(null);
  // Everything stored, deleted folders and quizzes included; null until loaded.
  let stored = $state(null);
  const view = $derived(stored ? cloudView(stored.folders, stored.quizzes) : null);
  // What is shown: the folders and quizzes not in the trash.
  const quizzes = $derived(view?.quizzes ?? null);
  const folders = $derived(view?.folders ?? []);
  const trash = $derived(view?.trash ?? []);
  // The folder selected in the tree; null is the top level and TRASH the trash.
  let current = $state(null);
  // The quiz whose earlier versions are shown.
  let historyOf = $state(null);
  let query = $state('');
  // Each quiz's searchable text, loaded when searching first starts.
  let texts = $state(null);
  let textsLoading = $state(false);
  // What is being dragged ({ kind, id }) and the tree row it is over.
  let dragging = $state(null);
  let dropOn = $state(undefined);
  let alive = true;
  const expanded = new SvelteSet();
  let tree = $state(null);
  let error = $state('');
  // What is running: { label, done, total }, where total is 0 until the number of parts is known.
  let busy = $state(null);
  let primary = $state(null);
  // The name being typed: { id, name, quiz }, with id null for a new folder, or a new quiz when quiz is true.
  let naming = $state(null);

  const progressText = $derived(busy ? (busy.total > 1 ? `${busy.label} ${busy.done} / ${busy.total}…` : `${busy.label}…`) : '');
  const openCopy = $derived(quizzes?.find((q) => q.id === library.activeId));
  const inTrash = $derived(current === TRASH);
  const crumbs = $derived(inTrash ? [] : folderPath(folders, current));
  const selected = $derived(crumbs.at(-1));
  // Where an upload of a quiz that isn't in the cloud yet goes.
  const uploadFolder = $derived(inTrash ? null : current);
  // The rows the tree shows: the top level, then the folders whose parents are all expanded, then the trash.
  const treeRows = $derived([
    { id: null, name: 'Cloud', parent: null, depth: 0, hasChildren: false },
    ...folderOptions(folders, null, (id) => expanded.has(id)).map((r) => ({ ...r, depth: r.depth + 1 })),
    { id: TRASH, name: 'Trash', parent: null, depth: 0, hasChildren: false },
  ]);
  // Quizzes are shown at the top level when their folder is gone.
  const folderOf = (q) => q.folder ?? null;
  // How the selected folder's quizzes are sorted, remembered in this browser.
  const SORTS = {
    newest: { label: 'Newest first', compare: (a, b) => b.uploaded - a.uploaded },
    oldest: { label: 'Oldest first', compare: (a, b) => a.uploaded - b.uploaded },
    name: { label: 'Name (A–Z)', compare: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) },
    'name-desc': { label: 'Name (Z–A)', compare: (a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }) },
    questions: { label: 'Most questions', compare: (a, b) => b.count - a.count },
    size: { label: 'Largest', compare: (a, b) => b.size - a.size },
  };
  const SORT_KEY = 'moodler-cloud-sort';
  let sortBy = $state(
    (() => {
      try {
        const s = localStorage.getItem(SORT_KEY);
        return s in SORTS ? s : 'newest';
      } catch {
        return 'newest';
      }
    })()
  );
  function setSort(s) {
    sortBy = s;
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {
      // Remembering the order is a convenience only.
    }
  }
  const shownQuizzes = $derived(
    (quizzes?.filter((q) => folderOf(q) === current) ?? []).sort((a, b) => SORTS[sortBy].compare(a, b) || b.uploaded - a.uploaded)
  );
  const quizzesPerFolder = $derived.by(() => {
    const counts = new Map();
    for (const q of quizzes ?? []) counts.set(folderOf(q), (counts.get(folderOf(q)) ?? 0) + 1);
    counts.set(TRASH, trash.length);
    return counts;
  });
  const uploadLabel = $derived(openCopy ? 'Upload again' : 'Upload here');
  const searching = $derived(!!query.trim() && !!quizzes);
  const results = $derived(
    searching
      ? quizzes
          .map((q) => ({ q, match: matchQuiz(q.name, texts?.get(q.id), query) }))
          .filter((r) => r.match)
          .sort((a, b) => b.match.byName - a.match.byName || b.match.total - a.match.total)
      : []
  );
  // Quizzes that can only be found by name, because they were uploaded before searching existed.
  const unindexed = $derived(texts && quizzes ? quizzes.filter((q) => !texts.has(q.id)).length : 0);

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const quizCount = (n) => (n === 1 ? '1 quiz' : `${n} quizzes`);
  const pathText = (id) => folderPath(folders, id).map((f) => f.name).join(' / ') || 'the top level';
  const isLive = (id) => id === null || folders.some((f) => f.id === id);

  async function run(label, fn) {
    error = '';
    busy = { label, done: 0, total: 0 };
    try {
      await fn();
    } catch (e) {
      error = cloudErrorMessage(e);
    } finally {
      busy = null;
      // Disabling the button that was clicked drops the focus, and without it Escape no longer reaches the dialog.
      await tick();
      if (document.activeElement === document.body) primary?.focus();
    }
  }

  const progress = (done, total) => {
    if (busy) Object.assign(busy, { done, total });
  };

  async function refresh() {
    const [q, f] = await Promise.all([listCloudQuizzes(user.uid), listCloudFolders(user.uid)]);
    stored = { quizzes: q, folders: f };
    if (!inTrash && !isLive(current)) current = null;
    if (historyOf && !quizzes.some((x) => x.id === historyOf)) historyOf = null;
    reveal(current);
  }

  /** Deletes for good what has been in the trash for longer than TRASH_DAYS. */
  async function purgeExpired() {
    const due = trash.filter((t) => daysLeft(t.deleted) <= 0);
    if (!due.length) return;
    try {
      for (const t of due) await deleteForGood(t);
    } catch {
      // Tried again the next time the dialog opens.
    }
    await refresh();
  }

  const deleteForGood = (t) => (t.kind === 'folder' ? deleteCloudFolders(user.uid, t.folderIds, t.quizzes) : deleteCloudQuiz(user.uid, t.item));

  /** Starts loading every quiz's searchable text, the first time something is searched. */
  function loadTexts() {
    if (texts || textsLoading || !user) return;
    textsLoading = true;
    listSearchTexts(user.uid)
      .then((m) => alive && (texts = m))
      .catch((e) => alive && (error = cloudErrorMessage(e)))
      .finally(() => (textsLoading = false));
  }

  $effect(() => {
    if (query.trim()) loadTexts();
  });

  /** Expands the folders above this one, so that it has a row in the tree. */
  function reveal(id) {
    for (const f of folderPath(folders, id).slice(0, -1)) expanded.add(f.id);
  }

  function show(id) {
    current = id;
    reveal(id);
  }

  // Keeps the selected folder in sight, such as when the dialog opens at a folder far down a long tree.
  $effect(() => {
    void [current, treeRows];
    tick().then(() => tree?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' }));
  });

  /** Selects the folder holding the open quiz's cloud copy. */
  function showOpenCopy() {
    if (openCopy) show(folderOf(openCopy));
  }

  // The folder last opened is remembered per account in this browser, and the dialog opens there next time.
  const folderKey = () => `moodler-cloud-folder-${user.uid}`;
  let restored = false;

  /** Opens the folder that was open last time; false when there is none, or it is gone. */
  function showLastFolder() {
    let id;
    try {
      id = localStorage.getItem(folderKey());
    } catch {
      return false;
    }
    if (id === null) return false;
    const target = id === '' ? null : id;
    if (target !== TRASH && !isLive(target)) return false;
    show(target);
    return true;
  }

  $effect(() => {
    const id = current;
    if (!user || !restored) return;
    try {
      localStorage.setItem(folderKey(), id ?? '');
    } catch {
      // Remembering the folder is a convenience only.
    }
  });

  onMount(() => {
    let stop = null;
    let gone = false;
    watchUser((u) => {
      user = u;
      ready = true;
      stored = texts = null;
      current = historyOf = null;
      query = '';
      expanded.clear();
      naming = null;
      restored = false;
      if (u) {
        run('Loading', async () => {
          await refresh();
          await purgeExpired();
          if (!showLastFolder()) showOpenCopy();
          restored = true;
        });
      }
    })
      .then((off) => (gone ? off() : (stop = off)))
      .catch((e) => {
        ready = true;
        error = cloudErrorMessage(e);
      });
    return () => {
      alive = false;
      gone = true;
      stop?.();
    };
  });

  const close = () => !busy && closeModal();

  const login = () => run('Signing in', signIn);
  async function logout() {
    const ok = await ask({
      title: 'Sign out?',
      message: `You will be signed out of ${user?.email ?? 'your Google account'} in Moodler. Your quizzes stay in the cloud and in this browser, and changes are no longer uploaded until you sign in again.`,
      confirmLabel: 'Sign out',
    });
    if (ok) await run('Signing out', signOut);
  }

  function open(id) {
    // An upload that is running puts a first copy in the selected folder.
    if (busy) return;
    show(id);
    naming = historyOf = quizNaming = null;
    query = '';
    error = '';
  }

  function toggle(id) {
    if (busy) return;
    if (!expanded.delete(id)) expanded.add(id);
    // Collapsing the folder around the selected one would hide the selection, so it moves up to the collapsed folder.
    else if (current !== id && folderTreeIds(folders, id).includes(current)) open(id);
  }

  /** Arrow keys, Home and End in the tree, as in a file manager. */
  function treeKey(e) {
    const at = treeRows.findIndex((r) => r.id === current);
    const row = treeRows[at];
    let next;
    if (e.key === 'ArrowDown') next = treeRows[at + 1];
    else if (e.key === 'ArrowUp') next = treeRows[at - 1];
    else if (e.key === 'Home') next = treeRows[0];
    else if (e.key === 'End') next = treeRows.at(-1);
    else if (e.key === 'ArrowRight') {
      if (row.hasChildren && !expanded.has(row.id)) toggle(row.id);
      else if (row.hasChildren) next = treeRows[at + 1];
    } else if (e.key === 'ArrowLeft') {
      if (expanded.has(row.id)) toggle(row.id);
      else if (row.id) next = treeRows.find((r) => r.id === row.parent);
    } else return;
    e.preventDefault();
    if (!next) return;
    open(next.id);
    tick().then(() => tree?.querySelector('[tabindex="0"]')?.focus());
  }

  function upload() {
    return run('Uploading', async () => {
      await refresh();
      const { id, text, name, count, entry } = prepareCloudUpload();
      // Read now: edits made while uploading change it, and those still need uploading afterwards.
      const updated = entry.updated;
      const existing = stored.quizzes.find((q) => q.id === id);
      if (existing && existing.version !== entry.cloudVersion) {
        const ok = await ask({
          title: 'Replace the cloud copy?',
          message: `The cloud copy of “${existing.name}” (uploaded ${when(existing.uploaded)}) isn't the one this browser last synced with, so it may have changes this browser doesn't have. Uploading replaces it; the earlier copy stays in its version history.`,
          confirmLabel: 'Replace',
          danger: true,
        });
        if (!ok) return;
      }
      const search = searchText(JSON.parse(text));
      const meta = await uploadCloudQuiz(user.uid, id, text, { name, count, folder: uploadFolder, search }, progress);
      // A quiz whose folder is in the trash would vanish with it, so it comes out to the selected folder.
      if (existing && !existing.deleted && !quizzes.some((q) => q.id === id)) await moveCloudQuiz(user.uid, id, uploadFolder);
      markCloudSynced(id, meta.version, updated);
      if (texts) texts = new Map(texts).set(id, search);
      await refresh();
      showOpenCopy();
      notify(`Uploaded “${name}” to ${pathText(openCopy ? folderOf(openCopy) : uploadFolder)}.`, 'success');
    });
  }

  function download(meta) {
    return run('Opening', async () => {
      const local = library.quizzes.find((q) => q.id === meta.id);
      if (local && statusOf(meta) !== 'same') {
        const ok = await ask({
          title: 'Replace this browser’s copy?',
          message: `“${local.name}” in this browser will be replaced by the cloud copy from ${when(meta.uploaded)}. You can go back with Undo (Ctrl+Z).`,
          confirmLabel: 'Replace',
        });
        if (!ok) return;
      }
      const text = await downloadCloudQuiz(user.uid, meta, progress);
      if (!(await applyCloudQuiz(meta, text))) throw new Error('This cloud copy could not be read.');
      notify(`Opened “${meta.name}” from the cloud.`, 'success');
      closeModal();
    });
  }

  /** Downloads the cloud copy of a quiz as a file in the given format, without opening it here. */
  function exportQuiz(meta, fmt) {
    return run('Exporting', async () => {
      const text = await downloadCloudQuiz(user.uid, meta, progress);
      let quiz;
      try {
        quiz = normalizeQuiz(JSON.parse(text));
      } catch {
        throw new Error('This cloud copy could not be read.');
      }
      const out = fmt.export(quiz, quiz.questions);
      if (!out.text.trim()) throw new Error(`None of the questions in “${meta.name}” can be written as ${fmt.label}.`);
      const name = `${slugify(meta.name)}${fmt.suffix ?? ''}.${fmt.ext}`;
      downloadText(out.text, name, fmt.mime);
      const skipped = out.warnings?.length;
      notify(`Downloaded ${name}.${skipped ? ` ${skipped} note${skipped === 1 ? '' : 's'}: ${out.warnings.slice(0, 3).join(' ')}${skipped > 3 ? ' …' : ''}` : ''}`, skipped ? 'warning' : 'success', skipped ? 10000 : 4000);
    });
  }

  /**
   * Sets whether a cloud quiz's questions need review, and uploads it as a new version. A copy in this browser that
   * matches the cloud copy, or has newer edits, is changed too and uploaded with its edits.
   */
  function setReview(q, on) {
    return run('Saving', async () => {
      let prepared;
      if (statusOf(q) === 'same' || statusOf(q) === 'edited') {
        prepared = await setStoredQuizReview(q.id, on);
        if (!prepared) throw new Error('This browser’s copy of the quiz could not be read.');
      } else {
        const text = await downloadCloudQuiz(user.uid, q, progress);
        let quiz;
        try {
          quiz = setNeedsReview(JSON.parse(text), on);
        } catch {
          throw new Error('This cloud copy could not be read.');
        }
        prepared = { text: JSON.stringify(quiz), count: quiz.questions.length };
      }
      const search = searchText(JSON.parse(prepared.text));
      const meta = await uploadCloudQuiz(user.uid, q.id, prepared.text, { name: q.name, count: prepared.count, folder: null, search }, progress);
      if (prepared.updated != null) markCloudSynced(q.id, meta.version, prepared.updated);
      if (texts) texts = new Map(texts).set(q.id, search);
      await refresh();
      notify(on ? `“${q.name}” now needs review: all its questions are marked as to review.` : `“${q.name}” no longer needs review.`, 'success');
    });
  }

  /**
   * Opens an earlier upload of a quiz in this browser. It then counts as edited since the upload, so that uploading
   * it makes it the newest version again.
   */
  async function restoreVersion(q, v) {
    const local = library.quizzes.find((x) => x.id === q.id);
    const ok = await ask({
      title: 'Open this version?',
      message: `${local ? `“${local.name}” in this browser will be replaced by the version` : 'This opens the version'} uploaded ${when(v.uploaded)} (${plural(v.count, 'question')}).${local ? ' You can go back with Undo (Ctrl+Z).' : ''} Upload it afterwards to make it the current cloud copy again.`,
      confirmLabel: 'Open',
    });
    if (!ok) return;
    await run('Downloading', async () => {
      const text = await downloadCloudQuiz(user.uid, { id: q.id, ...v }, progress);
      if (!(await applyCloudQuiz({ id: q.id, version: q.version }, text))) throw new Error('This version could not be read.');
      markCloudSynced(q.id, q.version, 0);
      notify(`Opened the version from ${when(v.uploaded)}. Upload it to make it the current cloud copy.`, 'success', 8000, { label: 'Upload', run: uploadChanges });
      closeModal();
    });
  }

  /** Puts a quiz or folder in the trash, with an Undo in the notification. */
  function remove(kind, id) {
    const item = kind === 'folder' ? folders.find((f) => f.id === id) : quizzes.find((q) => q.id === id);
    if (!item) return;
    const from = kind === 'folder' ? (item.parent ?? null) : folderOf(item);
    return run('Deleting', async () => {
      await trashCloudItem(user.uid, kind, id);
      if (kind === 'folder' && folderTreeIds(folders, id).includes(current)) current = from;
      await refresh();
      const undo = async () => {
        try {
          await restoreCloudItem(user.uid, kind, id, from);
          if (alive) await refresh();
        } catch (e) {
          notify(cloudErrorMessage(e), 'error', 8000);
        }
      };
      notify(`Moved “${item.name}” to the trash.`, 'success', 8000, { label: 'Undo', run: undo });
    });
  }

  /** A name for a folder coming back into `parent` that no other folder there has. */
  function freeName(name, parent, id) {
    if (!nameClash(name, parent, id)) return null;
    for (let n = 2; ; n++) if (!nameClash(`${name} (${n})`, parent, id)) return `${name} (${n})`;
  }

  /** Takes an item out of the trash, back where it was, or to the top level when that folder is gone. */
  function restore(t) {
    const into = isLive(t.from) ? t.from : null;
    return run('Restoring', async () => {
      const name = t.kind === 'folder' ? freeName(t.name, into, t.id) : null;
      await restoreCloudItem(user.uid, t.kind, t.id, into, name);
      await refresh();
      notify(`Restored “${name ?? t.name}” to ${pathText(into)}.`, 'success');
    });
  }

  async function deleteForever(t) {
    const what = t.kind === 'folder' ? [t.folderIds.length > 1 && plural(t.folderIds.length - 1, 'subfolder'), t.quizzes.length && quizCount(t.quizzes.length)].filter(Boolean) : [];
    const ok = await ask({
      title: 'Delete for good?',
      message: `“${t.name}”${what.length ? ` and everything in it (${what.join(' and ')})` : ''} will be permanently deleted from the cloud, with every version. Copies in your browsers are kept.`,
      confirmLabel: 'Delete for good',
      danger: true,
    });
    if (!ok) return;
    await run('Deleting', async () => {
      await deleteForGood(t);
      await refresh();
    });
  }

  async function emptyTrash() {
    const ok = await ask({
      title: 'Empty the trash?',
      message: `${trash.length === 1 ? 'The item' : `All ${trash.length} items`} in the trash will be permanently deleted from the cloud, with everything in them and every version. Copies in your browsers are kept.`,
      confirmLabel: 'Empty trash',
      danger: true,
    });
    if (!ok) return;
    await run('Deleting', async () => {
      const all = [...trash];
      for (let n = 0; n < all.length; n++) {
        progress(n, all.length);
        await deleteForGood(all[n]);
      }
      await refresh();
    });
  }

  // ---------------------------------------------------------------- dragging quizzes and folders onto the tree

  let openTimer = null;

  function dragStart(e, kind, id) {
    if (busy) return e.preventDefault();
    dragging = { kind, id };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', kind === 'folder' ? folders.find((f) => f.id === id)?.name : quizzes.find((q) => q.id === id)?.name);
  }

  function dragEnd() {
    dragging = null;
    dropOn = undefined;
    clearTimeout(openTimer);
  }

  /** Whether what is being dragged can be dropped on the tree row `target`. */
  function canDrop(target) {
    if (!dragging || busy) return false;
    if (target === TRASH) return true;
    const { kind, id } = dragging;
    if (kind === 'quiz') return folderOf(quizzes.find((q) => q.id === id)) !== target;
    return !folderTreeIds(folders, id).includes(target) && (folders.find((f) => f.id === id)?.parent ?? null) !== target;
  }

  function dragOver(e, r) {
    if (!canDrop(r.id)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropOn === r.id) return;
    dropOn = r.id;
    // Holding over a closed folder opens it, to drop further down.
    clearTimeout(openTimer);
    if (r.hasChildren && !expanded.has(r.id)) openTimer = setTimeout(() => dropOn === r.id && expanded.add(r.id), 700);
  }

  function dragLeave(e, r) {
    if (dropOn === r.id && !e.currentTarget.contains(e.relatedTarget)) dropOn = undefined;
  }

  function drop(e, target) {
    e.preventDefault();
    const what = dragging;
    dragEnd();
    if (!what) return;
    if (target === TRASH) return remove(what.kind, what.id);
    if (what.kind === 'folder') {
      const clash = nameClash(folders.find((f) => f.id === what.id).name, target, what.id);
      if (clash) return void (error = clash);
    }
    run('Moving', async () => {
      if (what.kind === 'folder') await updateCloudFolder(user.uid, what.id, { parent: target });
      else await moveCloudQuiz(user.uid, what.id, target);
      await refresh();
      if (what.kind === 'folder' && current === what.id) reveal(what.id);
      else if (target) expanded.add(target);
    });
  }

  /** An error message when a folder inside `parent` can't have this name, because another one there does. */
  function nameClash(name, parent, exceptId) {
    const clash = childFolders(folders, parent).find((f) => f.id !== exceptId && f.name.localeCompare(name, undefined, { sensitivity: 'base' }) === 0);
    return clash ? `There is already a folder named “${clash.name}” ${parent ? `in ${pathText(parent)}` : 'at the top level'}.` : '';
  }

  function saveName(e) {
    e.preventDefault();
    const { id, name: typed } = naming;
    const name = typed.trim();
    if (!name) return;
    if (naming.quiz) return createQuiz(name);
    const parent = id ? folders.find((f) => f.id === id).parent : current;
    const clash = nameClash(name, parent, id);
    if (clash) {
      error = clash;
      return;
    }
    run(id ? 'Renaming' : 'Creating folder', async () => {
      if (id) await updateCloudFolder(user.uid, id, { name });
      const made = id ? null : await createCloudFolder(user.uid, name, current);
      await refresh();
      if (made) show(made);
      naming = null;
    });
  }

  /**
   * Creates an empty quiz in the selected folder and opens it here. As it is in the cloud, the questions added to it
   * are uploaded automatically (or with Ctrl+S).
   */
  function createQuiz(name) {
    const folder = uploadFolder;
    run('Creating quiz', async () => {
      const { id, quiz, text } = blankQuizForCloud(name);
      const search = searchText(quiz);
      const meta = await uploadCloudQuiz(user.uid, id, text, { name, count: 0, folder, search }, progress);
      if (texts) texts = new Map(texts).set(id, search);
      if (!(await applyCloudQuiz(meta, text))) throw new Error('The new quiz could not be opened.');
      naming = null;
      notify(`Created “${name}” in ${folder ? pathText(folder) : 'Cloud'}. Questions you add are uploaded automatically.`, 'success', 5000);
      closeModal();
    });
  }

  function startNaming(id, name, quiz = false) {
    naming = { id, name, quiz };
    quizNaming = null;
    error = '';
  }

  const startNewQuiz = () => startNaming(null, '', true);

  function cancelNaming() {
    naming = null;
    error = '';
  }

  function cancelOnEscape(e, cancel) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    cancel();
    primary?.focus();
  }

  /** How a cloud copy relates to this browser's quiz with the same ID. */
  function statusOf(meta) {
    const local = library.quizzes.find((q) => q.id === meta.id);
    if (!local) return 'absent';
    if (local.cloudVersion !== meta.version) return 'different';
    return local.updated === local.cloudUpdated ? 'same' : 'edited';
  }

  const STATUS = {
    absent: 'Not in this browser',
    different: 'Differs from this browser',
    same: 'Up to date',
    edited: 'Edited here since upload',
  };

  // ---------------------------------------------------------------- dropping Moodle XML files to upload them

  // Whether files are being dragged over the dialog, and how many elements deep.
  let fileDrag = $state(false);
  let fileDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  const canTakeFiles = () => !!user && !!quizzes && !busy;
  const isXml = (f) => /\.xml$/i.test(f.name) || f.type === 'text/xml' || f.type === 'application/xml';

  // These run on the document, before the app's own window handlers, which would open the import dialog.
  function fileEnter(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    fileDepth++;
    fileDrag = canTakeFiles();
  }
  function fileLeave(e) {
    if (!hasFiles(e)) return;
    e.stopPropagation();
    if (--fileDepth <= 0) {
      fileDepth = 0;
      fileDrag = false;
    }
  }
  function fileOver(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = canTakeFiles() ? 'copy' : 'none';
  }
  function fileDrop(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    fileDepth = 0;
    fileDrag = false;
    if (canTakeFiles()) uploadFiles([...e.dataTransfer.files]);
  }

  /** Uploads Moodle XML files as new cloud quizzes in the selected folder, without opening them here. */
  function uploadFiles(files) {
    const xml = files.filter(isXml);
    if (!xml.length) {
      error = 'Only Moodle XML files (.xml) can be uploaded by dropping them here.';
      return;
    }
    const skipped = files.filter((f) => !isXml(f)).map((f) => f.name);
    const folder = uploadFolder;
    const problems = [];
    return run('Uploading', async () => {
      const done = [];
      for (const [n, file] of xml.entries()) {
        busy.label = xml.length > 1 ? `Uploading ${n + 1} of ${xml.length}: ${file.name}` : `Uploading ${file.name}`;
        let prepared;
        try {
          prepared = quizFromXmlFile(await file.text(), file.name);
        } catch (e) {
          problems.push(`${file.name} could not be read${e?.message ? `: ${e.message}` : '.'}`);
          continue;
        }
        const { id, quiz, text, name, count } = prepared;
        const search = searchText(quiz);
        await uploadCloudQuiz(user.uid, id, text, { name, count, folder, search }, progress);
        if (texts) texts = new Map(texts).set(id, search);
        done.push(name);
      }
      await refresh();
      if (done.length) {
        query = '';
        show(folder);
        notify(`Uploaded ${done.length === 1 ? `“${done[0]}”` : quizCount(done.length)} to ${pathText(folder)}.`, 'success');
      }
    }).then(() => {
      if (skipped.length) problems.push(`Skipped ${skipped.join(', ')}: only Moodle XML files (.xml) can be uploaded here.`);
      if (problems.length) error = [error, ...problems].filter(Boolean).join('\n');
    });
  }

  // ---------------------------------------------------------------- right-click menus

  // The open menu: { x, y, items }.
  let menu = $state(null);

  /** Opens a menu at the pointer, or under the element when opened from the keyboard. */
  function openMenu(e, items) {
    // Text fields keep the browser's own menu.
    if (e.target.closest?.('input, select, textarea')) return;
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    let { clientX: x, clientY: y } = e;
    if (!x && !y) {
      const r = e.currentTarget.getBoundingClientRect();
      x = r.left + 16;
      y = r.top + Math.min(r.height, 28);
    }
    menu = { x, y, items };
  }

  async function closeMenu() {
    menu = null;
    // Without the focus inside the dialog, Escape would no longer close it.
    await tick();
    if (document.activeElement === document.body) primary?.focus();
  }

  /** The formats a cloud quiz can be exported to, as menu items. */
  const exportMenu = (q) =>
    FORMATS.filter((f) => f.export).map((f) => ({ label: f.id === 'json' ? 'Project (JSON)' : f.label, icon: FileDown, run: () => exportQuiz(q, f) }));

  function quizMenu(q, fromSearch) {
    const inFolder = (fn) => () => {
      if (fromSearch) open(folderOf(q));
      fn();
    };
    return [
      { label: 'Open', icon: CloudDownload, run: () => download(q) },
      { label: 'Export as', icon: FileDown, items: exportMenu(q) },
      { label: historyOf === q.id && !fromSearch ? 'Hide version history' : 'Version history', icon: History, run: inFolder(() => (historyOf = historyOf === q.id && !fromSearch ? null : q.id)) },
      fromSearch && { label: 'Show in its folder', icon: Folder, run: () => open(folderOf(q)) },
      { label: 'Rename…', icon: Pencil, run: inFolder(() => startQuizNaming(q)) },
      needsReview(q)
        ? { label: 'Mark as not needing review', icon: CircleCheck, run: () => setReview(q, false) }
        : { label: 'Mark as needing review', icon: CircleDot, run: () => setReview(q, true) },
      '-',
      { label: 'Move to the trash', icon: Trash2, danger: true, run: () => remove('quiz', q.id) },
    ].filter(Boolean);
  }

  function rowMenu(r) {
    if (r.id === TRASH) {
      return [
        { label: 'Empty trash', icon: Trash2, danger: true, disabled: !trash.length, run: emptyTrash },
      ];
    }
    const newQuiz = { label: 'New quiz', icon: FilePlus, run: () => (open(r.id), startNewQuiz()) };
    const newFolder = { label: 'New folder', icon: FolderPlus, run: () => (open(r.id), startNaming(null, '')) };
    if (!r.id) return [newQuiz, newFolder];
    return [
      newQuiz,
      newFolder,
      { label: 'Rename…', icon: Pencil, run: () => (open(r.id), startNaming(r.id, r.name)) },
      '-',
      { label: 'Move to the trash', icon: Trash2, danger: true, run: () => remove('folder', r.id) },
    ];
  }

  const trashMenu = (t) => [
    { label: isLive(t.from) ? `Restore to ${pathText(t.from)}` : 'Restore to the top level', icon: Undo2, run: () => restore(t) },
    '-',
    { label: 'Delete for good…', icon: Trash2, danger: true, run: () => deleteForever(t) },
  ];

  // The empty part of a folder's list.
  const folderMenu = () => [
    { label: 'New quiz', icon: FilePlus, run: startNewQuiz },
    { label: 'New folder', icon: FolderPlus, run: () => startNaming(null, '') },
    { label: openCopy ? 'Upload the open quiz again' : 'Upload the open quiz here', icon: CloudUpload, disabled: !app.quiz.questions.length, run: upload },
    { label: 'Upload Moodle XML files…', icon: FileText, run: () => filePicker?.click() },
  ];
  let filePicker = $state(null);

  const when = (t) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  // "5 minutes ago", kept current while the dialog is open; the exact time is in the tooltip.
  let now = $state(Date.now());
  onMount(() => {
    const tick = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(tick);
  });
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const UNITS = [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['week', 7 * 24 * 3600],
    ['day', 24 * 3600],
    ['hour', 3600],
    ['minute', 60],
  ];
  function ago(t) {
    const seconds = Math.max(0, (now - t) / 1000);
    if (seconds < 45) return 'just now';
    const [unit, size] = UNITS.find(([, size]) => seconds >= size) ?? UNITS.at(-1);
    return relative.format(-Math.max(1, Math.round(seconds / size)), unit);
  }

  // ---------------------------------------------------------------- renaming quizzes

  // The quiz whose name is being typed: { id, name }.
  let quizNaming = $state(null);

  function startQuizNaming(q) {
    if (busy) return;
    quizNaming = { id: q.id, name: q.name };
    naming = null;
    error = '';
  }

  function saveQuizName(e) {
    e.preventDefault();
    const { id } = quizNaming;
    const name = quizNaming.name.trim();
    const q = quizzes.find((x) => x.id === id);
    if (!name || !q) return;
    if (name === q.name) return void (quizNaming = null);
    run('Renaming', async () => {
      await renameCloudQuiz(user.uid, id, name);
      // This browser's copy takes the new name too.
      await renameCloudCopy(id, name);
      await refresh();
      quizNaming = null;
    });
  }

  // ---------------------------------------------------------------- resizing the folder tree

  const TREE_KEY = 'moodler-cloud-tree-width';
  const TREE_MIN = 160;
  let panes = $state(null);
  let treeWidth = $state(
    (() => {
      try {
        return Number(localStorage.getItem(TREE_KEY)) || 250;
      } catch {
        return 250;
      }
    })()
  );
  let resizing = $state(false);
  // The list keeps at least this much room.
  const treeMax = () => Math.max(TREE_MIN, (panes?.clientWidth ?? 900) - 320);
  const shownTreeWidth = $derived(Math.min(Math.max(treeWidth, TREE_MIN), treeMax()));

  function setTreeWidth(w) {
    treeWidth = Math.round(Math.min(Math.max(w, TREE_MIN), treeMax()));
    try {
      localStorage.setItem(TREE_KEY, String(treeWidth));
    } catch {
      // Remembering the width is a convenience only.
    }
  }

  function resizeStart(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    resizing = true;
    const left = panes.getBoundingClientRect().left;
    const move = (ev) => setTreeWidth(ev.clientX - left);
    const end = () => {
      resizing = false;
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function resizeKey(e) {
    const step = e.shiftKey ? 50 : 16;
    if (e.key === 'ArrowLeft') setTreeWidth(shownTreeWidth - step);
    else if (e.key === 'ArrowRight') setTreeWidth(shownTreeWidth + step);
    else if (e.key === 'Home') setTreeWidth(TREE_MIN);
    else if (e.key === 'End') setTreeWidth(treeMax());
    else return;
    e.preventDefault();
  }

  const sizeText = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
  const focusOnMount = (el) => {
    el.focus();
    el.select?.();
  };
</script>

<!-- How many questions are reviewed and still to review, as of the upload (uploads from before this was recorded show nothing). -->
{#snippet review(q)}
  {#if q.review}
    <span class="review" title="{q.review.done} reviewed{q.review.todo ? `, ${q.review.todo} not reviewed yet` : ''}">
      <span class="done"><CircleCheck size={12} />{q.review.done}</span>
      {#if q.review.todo}<span class="todo"><CircleDot size={12} />{q.review.todo}</span>{/if}
    </span>
  {/if}
{/snippet}

{#snippet nameRow(label, placeholder)}
  <form class="inline" onsubmit={saveName} onkeydown={(e) => cancelOnEscape(e, cancelNaming)}>
    <input class="input" aria-label={label} {placeholder} maxlength="100" bind:value={naming.name} use:focusOnMount />
    <button class="btn btn-ghost btn-icon" type="submit" title="Save" aria-label="Save" disabled={!!busy || !naming.name.trim()}><Check size={16} /></button>
    <button class="btn btn-ghost btn-icon" type="button" title="Cancel" aria-label="Cancel" disabled={!!busy} onclick={cancelNaming}><X size={16} /></button>
  </form>
{/snippet}

<svelte:document ondragenter={fileEnter} ondragleave={fileLeave} ondragover={fileOver} ondrop={fileDrop} />

<Modal title="Cloud" width="1360px" resizable="cloud" onclose={close}>
  {#snippet headerExtra()}
    {#if user}
      {#if quizzes}
        <div class="search">
          <Search size={15} />
          <input
            class="input input-sm"
            type="search"
            placeholder="Search all quizzes and questions…"
            aria-label="Search all cloud quizzes"
            bind:value={query}
            onkeydown={(e) => e.key === 'Escape' && query && (e.stopPropagation(), (query = ''))}
          />
        </div>
      {/if}
      <span class="who" title="Signed in as {user.email}">Signed in as <strong>{user.email}</strong></span>
      <button class="btn btn-ghost btn-sm" disabled={!!busy} onclick={logout}><LogOut size={14} /> Sign out</button>
    {/if}
  {/snippet}
  {#if !ready}
    <p class="note">Connecting…</p>
  {:else if !user}
    <p class="note">Sign in with Google to keep private copies of your quizzes. Only your account can read them. Your work stays in this browser too, and nothing is uploaded until you choose to.</p>
  {:else}
    {#if quizzes}
      <div class="panes" class:resizing bind:this={panes} style:--tree-w="{shownTreeWidth}px">
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <div
          class="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the folder list"
          aria-valuenow={shownTreeWidth}
          aria-valuemin={TREE_MIN}
          tabindex="0"
          title="Drag to resize the folder list (double-click to reset)"
          onpointerdown={resizeStart}
          onkeydown={resizeKey}
          ondblclick={() => setTreeWidth(250)}
        ></div>
        {#if fileDrag}
          <div class="drop-overlay" aria-hidden="true">
            <CloudUpload size={28} />
            <strong>Drop Moodle XML files to upload them</strong>
            <span>They go to {uploadFolder ? pathText(uploadFolder) : 'the top level'} as new quizzes.</span>
          </div>
        {/if}
        <div class="tree" role="tree" aria-label="Folders" bind:this={tree}>
          {#each treeRows as r (r.id ?? 'top level')}
            {@const count = quizzesPerFolder.get(r.id)}
            {@const movable = r.depth > 0}
            <div
              class="row"
              class:selected={r.id === current && !searching}
              class:trash-row={r.id === TRASH}
              class:drop={dropOn === r.id}
              class:dragged={dragging?.kind === 'folder' && dragging.id === r.id}
              role="treeitem"
              aria-level={r.depth + 1}
              aria-selected={r.id === current}
              aria-expanded={r.hasChildren ? expanded.has(r.id) : undefined}
              tabindex={r.id === current ? 0 : -1}
              title={movable ? `${r.name}\nDrag onto another folder to move it` : r.name}
              style:padding-left="{6 + Math.min(r.depth, 8) * 14}px"
              draggable={movable && !busy}
              ondragstart={(e) => movable && dragStart(e, 'folder', r.id)}
              ondragend={dragEnd}
              ondragover={(e) => dragOver(e, r)}
              ondragleave={(e) => dragLeave(e, r)}
              ondrop={(e) => drop(e, r.id)}
              onclick={() => {
                open(r.id);
                if (r.hasChildren && !busy) expanded.add(r.id);
              }}
              onkeydown={treeKey}
              oncontextmenu={(e) => openMenu(e, rowMenu(r))}
            >
              {#if r.hasChildren}
                <!-- The arrow keys do this from the keyboard. -->
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <span
                  class="twist"
                  class:open={expanded.has(r.id)}
                  aria-hidden="true"
                  onclick={(e) => {
                    e.stopPropagation();
                    toggle(r.id);
                  }}><ChevronRight size={14} /></span>
              {:else if movable}
                <span class="twist"></span>
              {/if}
              {#if r.id === TRASH}<Trash2 size={15} />{:else if r.id}<Folder size={15} />{:else}<Cloud size={15} />{/if}
              <span class="label">{r.name}</span>
              {#if count}<span class="count" title={r.id === TRASH ? plural(count, 'item') : quizCount(count)}>{count}</span>{/if}
            </div>
          {/each}
        </div>

        <section class="files" aria-label={searching ? 'Search results' : inTrash ? 'Trash' : 'Quizzes in the selected folder'}>
          {#if searching}
            <div class="bar">
              <span class="heading">{results.length ? `${quizCount(results.length)} found` : 'Search results'}</span>
              <button class="btn btn-sm" onclick={() => (query = '')}><X size={14} /> Clear search</button>
            </div>
            <ul class="list">
              {#each results as { q, match } (q.id)}
                <li class="item" class:open={q.id === library.activeId} oncontextmenu={(e) => openMenu(e, quizMenu(q, true))}>
                  <div class="info">
                    <span class="name" title={q.name}>{q.name}</span>
                    <span class="meta">{folderOf(q) ? pathText(folderOf(q)) : 'Cloud'} · {plural(q.count, 'question')}{@render review(q)} ·<span title={when(q.uploaded)}>{ago(q.uploaded)}</span></span>
                    {#each match.questions as m}
                      <span class="hit">{#if m.title}<strong>{m.title}</strong> — {/if}{m.excerpt}</span>
                    {/each}
                    {#if match.total > match.questions.length}<span class="meta">and {plural(match.total - match.questions.length, 'more question')}</span>{/if}
                  </div>
                  <button class="btn btn-ghost btn-icon" title="Show in its folder" aria-label="Show {q.name} in its folder" disabled={!!busy} onclick={() => open(folderOf(q))}><Folder size={15} /></button>
                  <button class="btn btn-sm" disabled={!!busy} onclick={() => download(q)}><CloudDownload size={15} /> Open</button>
                </li>
              {:else}
                <li class="note empty">{textsLoading ? 'Searching…' : `No quizzes or questions match “${query.trim()}”.`}</li>
              {/each}
              {#if results.length && textsLoading}<li class="note small">Searching the questions…</li>{/if}
              {#if unindexed}
                <li class="note small">{unindexed === 1 ? 'One quiz was' : `${unindexed} quizzes were`} uploaded before question search existed, so {unindexed === 1 ? 'it is' : 'they are'} only searched by name. Upload {unindexed === 1 ? 'it' : 'them'} again to search the questions too.</li>
              {/if}
            </ul>
          {:else if inTrash}
            <div class="bar">
              <span class="heading">Trash</span>
              <button class="btn btn-sm" disabled={!!busy || !trash.length} onclick={emptyTrash}><Trash2 size={14} /> Empty trash</button>
            </div>
            <ul class="list">
              {#each trash as t (t.id)}
                {@const left = Math.max(1, daysLeft(t.deleted))}
                <li class="item" oncontextmenu={(e) => openMenu(e, trashMenu(t))}>
                  <span class="kind">{#if t.kind === 'folder'}<Folder size={16} />{:else}<FileText size={16} />{/if}</span>
                  <div class="info">
                    <span class="name" title={t.name}>{t.name}</span>
                    <span class="meta">
                      {#if t.kind === 'folder'}{[t.folderIds.length > 1 && plural(t.folderIds.length - 1, 'subfolder'), quizCount(t.quizzes.length)].filter(Boolean).join(', ')}{:else}{plural(t.item.count, 'question')}{/if}
                      · deleted <span title={when(t.deleted)}>{ago(t.deleted)}</span> from {isLive(t.from) ? pathText(t.from) : 'a folder that is gone'}
                    </span>
                    <span class="meta">Deleted for good in {plural(left, 'day')}</span>
                  </div>
                  <button class="btn btn-sm" disabled={!!busy} title={isLive(t.from) ? `Put it back in ${pathText(t.from)}` : 'Put it back at the top level'} onclick={() => restore(t)}><Undo2 size={15} /> Restore</button>
                  <button class="btn btn-ghost btn-icon danger" title="Delete for good" aria-label="Delete {t.name} for good" disabled={!!busy} onclick={() => deleteForever(t)}><Trash2 size={15} /></button>
                </li>
              {:else}
                <li class="note empty">The trash is empty. Deleted quizzes and folders stay here for {TRASH_DAYS} days before they are deleted for good.</li>
              {/each}
            </ul>
          {:else}
          <div class="bar">
            <nav class="crumbs" aria-label="Folder path">
              <button class="crumb" aria-current={current ? undefined : 'page'} onclick={() => open(null)}>Cloud</button>
              {#if crumbs.length > 3}
                <ChevronRight size={13} />
                <span class="crumb-gap" title={pathText(current)}>…</span>
              {/if}
              {#each crumbs.slice(-3) as c (c.id)}
                <ChevronRight size={13} />
                <button class="crumb" aria-current={c.id === current ? 'page' : undefined} title={c.name} onclick={() => open(c.id)}>{c.name}</button>
              {/each}
            </nav>
            <div class="actions">
              <label class="sort" title="Sort the quizzes in this folder">
                <span>Sort by</span>
                <select class="input input-sm" value={sortBy} onchange={(e) => setSort(e.currentTarget.value)} aria-label="Sort quizzes by">
                  {#each Object.entries(SORTS) as [key, s] (key)}<option value={key}>{s.label}</option>{/each}
                </select>
              </label>
              {#if selected}
                <button class="btn btn-ghost btn-icon" title="Rename the folder" aria-label="Rename {selected.name}" disabled={!!busy} onclick={() => startNaming(selected.id, selected.name)}><Pencil size={15} /></button>
                <button class="btn btn-ghost btn-icon danger" title="Move the folder to the trash" aria-label="Delete the folder {selected.name}" disabled={!!busy} onclick={() => remove('folder', selected.id)}><Trash2 size={15} /></button>
              {/if}
              <button class="btn btn-sm" disabled={!!busy} onclick={startNewQuiz}><FilePlus size={15} /> New quiz</button>
              <button class="btn btn-sm" disabled={!!busy} onclick={() => startNaming(null, '')}><FolderPlus size={15} /> New folder</button>
            </div>
            {#if naming?.quiz}
              {@render nameRow('New quiz name', 'New quiz')}
            {:else if naming}
              {@render nameRow(naming.id ? `New name for ${selected.name}` : 'New folder name', naming.id ? 'Folder name' : 'New folder')}
            {/if}
          </div>

          <ul class="list" oncontextmenu={(e) => openMenu(e, folderMenu())}>
            {#each shownQuizzes as q (q.id)}
              {@const versions = quizVersions(q)}
              <li
                class="item"
                class:open={q.id === library.activeId}
                class:dragged={dragging?.kind === 'quiz' && dragging.id === q.id}
                draggable={!busy && quizNaming?.id !== q.id}
                title="Drag onto a folder in the tree to move it there"
                ondragstart={(e) => dragStart(e, 'quiz', q.id)}
                ondragend={dragEnd}
                oncontextmenu={(e) => openMenu(e, quizMenu(q, false))}
              >
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="info" ondblclick={(e) => !busy && quizNaming?.id !== q.id && !e.target.closest('form') && download(q)}>
                  {#if quizNaming?.id === q.id}
                    <form class="inline" onsubmit={saveQuizName} onkeydown={(e) => cancelOnEscape(e, () => (quizNaming = null))}>
                      <input class="input input-sm" aria-label="New name for {q.name}" maxlength="200" bind:value={quizNaming.name} use:focusOnMount />
                      <button class="btn btn-ghost btn-icon" type="submit" title="Save" aria-label="Save" disabled={!!busy || !quizNaming.name.trim()}><Check size={16} /></button>
                      <button class="btn btn-ghost btn-icon" type="button" title="Cancel" aria-label="Cancel" disabled={!!busy} onclick={() => (quizNaming = null)}><X size={16} /></button>
                    </form>
                  {:else}
                    <span class="name" title="{q.name}{'\n'}Double-click to open">{q.name}</span>
                  {/if}
                  <span class="meta">{plural(q.count, 'question')}{@render review(q)} · {sizeText(q.size)} · <span title={when(q.uploaded)}>{ago(q.uploaded)}</span></span>
                  {#if statusOf(q) !== 'absent'}<span class="state {statusOf(q)}">{STATUS[statusOf(q)]}</span>{/if}
                </div>
                <button class="btn btn-sm" disabled={!!busy} onclick={() => download(q)}><CloudDownload size={15} /> Open</button>
                <button class="btn btn-ghost btn-icon" title="Export: download as Moodle XML, GIFT, Aiken, ExamView XML or project file" aria-label="Export {q.name}" aria-haspopup="menu" disabled={!!busy} onclick={(e) => openMenu(e, exportMenu(q))}><FileDown size={15} /></button>
                <button class="btn btn-ghost btn-icon" title="Rename" aria-label="Rename {q.name}" disabled={!!busy} onclick={() => startQuizNaming(q)}><Pencil size={15} /></button>
                <button
                  class="btn btn-ghost btn-icon"
                  class:on={historyOf === q.id}
                  title="Version history: earlier uploads of this quiz"
                  aria-label="Version history of {q.name}"
                  aria-expanded={historyOf === q.id}
                  disabled={!!busy}
                  onclick={() => (historyOf = historyOf === q.id ? null : q.id)}><History size={15} /></button
                >
                <button class="btn btn-ghost btn-icon danger" title="Move to the trash" aria-label="Delete the cloud copy of {q.name}" disabled={!!busy} onclick={() => remove('quiz', q.id)}><Trash2 size={15} /></button>
                {#if historyOf === q.id}
                  <div class="versions">
                    <ol aria-label="Versions of {q.name}">
                      {#each versions as v, i (v.version)}
                        <li class="version">
                          <span class="v-when" title={when(v.uploaded)}>{ago(v.uploaded)}</span>
                          <span class="meta">{plural(v.count, 'question')} · {sizeText(v.size)}{v.name !== q.name ? ` · named “${v.name}”` : ''}</span>
                          {#if i === 0}
                            <span class="current">Current</span>
                          {:else}
                            <button class="btn btn-sm" disabled={!!busy} title="Open this version in this browser" onclick={() => restoreVersion(q, v)}>Open</button>
                          {/if}
                        </li>
                      {/each}
                    </ol>
                    <p class="note small">
                      {versions.length === 1 ? 'There are no earlier uploads yet.' : ''} The last {KEEP_VERSIONS} uploads are kept.
                    </p>
                  </div>
                {/if}
              </li>
            {:else}
              <li class="note empty">{quizzes.length || folders.length ? 'No quizzes in this folder.' : 'Nothing uploaded yet. Upload the open quiz, or create a new one with New quiz.'} Moodle XML files dropped here are uploaded to this folder.</li>
            {/each}
          </ul>
          {/if}
        </section>
      </div>
    {/if}
  {/if}

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  <input
    type="file"
    accept=".xml,text/xml,application/xml"
    multiple
    hidden
    bind:this={filePicker}
    onchange={(e) => {
      const files = [...e.currentTarget.files];
      e.currentTarget.value = '';
      if (files.length) uploadFiles(files);
    }}
  />

  {#if menu}<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={closeMenu} />{/if}

  {#snippet footer()}
    <span class="progress" role="status">{progressText}</span>
    <button class="btn" disabled={!!busy} onclick={close}>Close</button>
    {#if user}
      <button class="btn btn-primary upload" bind:this={primary} disabled={!!busy || !quizzes || !app.quiz.questions.length} title={!app.quiz.questions.length ? 'This quiz has no questions yet' : openCopy ? 'Upload the open quiz over its cloud copy' : `Upload the open quiz to ${selected?.name ?? 'Cloud'}`} onclick={upload}>
        <CloudUpload size={16} /> <span class="upload-text">{uploadLabel}</span>
      </button>
    {:else}
      <button class="btn btn-primary" bind:this={primary} disabled={!ready || !!busy} onclick={login}><LogIn size={16} /> Sign in with Google</button>
    {/if}
  {/snippet}
</Modal>

<style>
  .note {
    margin: 0;
    color: var(--text-2);
  }
  .empty {
    padding: 14px 4px;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .panes {
    display: grid;
    grid-template-columns: var(--tree-w, 250px) minmax(0, 1fr);
    /* Fills the dialog, which is tall by default and can be resized from its corner. */
    flex: 1 1 min(68vh, 720px);
    min-height: 240px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .tree {
    min-height: 0;
    padding: 6px;
    overflow: auto;
    border-right: 1px solid var(--border);
    background: var(--surface-2);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 5px;
    min-height: 30px;
    padding-right: 8px;
    border-radius: 6px;
    color: var(--text-2);
    cursor: pointer;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.selected {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 500;
  }
  .row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .twist {
    flex: none;
    width: 18px;
    display: inline-flex;
    justify-content: center;
    color: var(--text-3);
    transition: transform 0.1s;
  }
  .twist.open {
    transform: rotate(90deg);
  }
  .label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .count {
    flex: none;
    font-size: 12px;
    font-weight: 400;
    color: var(--text-3);
  }
  .files {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .bar {
    flex-wrap: wrap;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
  }
  .actions {
    flex: none;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .actions .btn-sm {
    margin-left: 6px;
  }
  .sort {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-right: 6px;
    font-size: 13px;
    color: var(--text-3);
    white-space: nowrap;
  }
  .sort select {
    width: auto;
  }
  .who {
    min-width: 0;
    flex: 0 1 auto;
    font-size: 13px;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .crumbs {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    color: var(--text-3);
  }
  .crumbs :global(svg),
  .crumb-gap {
    flex: none;
  }
  .crumb {
    flex: 0 1 auto;
    min-width: 24px;
    padding: 3px 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--text-2);
    font: inherit;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .crumb:hover {
    background: var(--hover);
  }
  .crumb[aria-current='page'] {
    flex-shrink: 0;
    max-width: 60%;
    color: var(--text);
    font-weight: 600;
  }
  .list {
    flex: 1;
    min-height: 0;
    list-style: none;
    margin: 0;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: auto;
  }
  .item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 9px 8px 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .item.open {
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    background: var(--accent-soft);
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .name {
    color: var(--text);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta,
  .state {
    font-size: 12px;
    color: var(--text-3);
  }
  .review {
    display: inline-flex;
    gap: 6px;
    margin-left: 6px;
    vertical-align: -2px;
  }
  .review > span {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .review .done {
    color: var(--success);
  }
  .review .todo {
    color: var(--warning);
  }
  .state.same {
    color: var(--success);
  }
  .state.different,
  .state.edited {
    color: var(--warning);
  }
  .danger:hover:not(:disabled) {
    color: var(--danger);
  }
  .inline {
    flex: 1 0 100%;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .inline .input {
    flex: 1;
    min-width: 0;
  }
  .splitter {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--tree-w, 250px) - 4px);
    z-index: 2;
    width: 8px;
    cursor: col-resize;
    touch-action: none;
  }
  .splitter::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3px;
    width: 2px;
    background: transparent;
    transition: background 0.12s;
  }
  .splitter:hover::after,
  .splitter:focus-visible::after,
  .resizing .splitter::after {
    background: var(--accent);
  }
  .splitter:focus-visible {
    outline: none;
  }
  .resizing {
    cursor: col-resize;
    user-select: none;
  }
  .error {
    margin: 12px 0 0;
    color: var(--danger);
    white-space: pre-line;
  }
  .panes {
    position: relative;
  }
  .drop-overlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 16px;
    border: 2px dashed var(--accent);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--surface) 88%, var(--accent));
    color: var(--accent);
    text-align: center;
    pointer-events: none;
  }
  .drop-overlay span {
    color: var(--text-2);
  }
  .small {
    font-size: 12px;
    padding: 4px;
  }
  .search {
    flex: 0 1 340px;
    min-width: 120px;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-3);
  }
  .search .input {
    flex: 1;
    min-width: 0;
  }
  .heading {
    font-weight: 600;
    padding: 3px 6px;
  }
  .hit {
    font-size: 12.5px;
    color: var(--text-2);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
  }
  .hit strong {
    font-weight: 500;
    color: var(--text);
  }
  .kind {
    flex: none;
    display: inline-flex;
    color: var(--text-3);
  }
  .trash-row {
    margin-top: 6px;
    border-top: 1px solid var(--border);
    border-radius: 0 0 6px 6px;
  }
  .row.drop {
    background: var(--accent-soft);
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
    color: var(--accent);
  }
  .dragged {
    opacity: 0.45;
  }
  .item[draggable='true'] {
    cursor: grab;
  }
  .item .btn {
    cursor: pointer;
  }
  .btn.on {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .versions {
    flex: 1 0 100%;
    padding-top: 6px;
    border-top: 1px dashed var(--border);
  }
  .versions ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .version {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 10px;
    min-height: 32px;
  }
  .v-when {
    font-size: 13px;
    color: var(--text);
  }
  .version .meta {
    flex: 1;
    min-width: 0;
  }
  .current {
    font-size: 12px;
    font-weight: 500;
    color: var(--success);
    padding: 0 8px;
  }
  .progress {
    margin-right: auto;
    font-size: 13px;
    color: var(--text-3);
  }
  .upload {
    max-width: 300px;
  }
  .upload-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 640px) {
    .panes {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 35%) minmax(0, 1fr);
      height: 68vh;
    }
    .tree {
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    .splitter {
      display: none;
    }
    .crumbs,
    .info {
      flex: 1 0 100%;
    }
    .who {
      display: none;
    }
  }
</style>
