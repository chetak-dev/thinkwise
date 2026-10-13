'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CloudOff,
  Copy,
  Download,
  Eye,
  FileUp,
  ImageIcon,
  Loader2,
  Play,
  Plus,
  Redo2,
  Rocket,
  Settings,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  ANSWER_TEXT_MAX,
  MAX_BLANKS,
  NUMBER_LIMIT,
  RATING_MAX_VALUES,
  RATING_MIN_VALUES,
  countBlanks,
  isScored,
  usesOptions,
  DIFFICULTIES,
  EXPLANATION_MAX,
  HINT_MAX,
  IMAGE_URL_MAX,
  MAX_ACCEPTED,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  OPTION_TEXT_MAX,
  PENALTY_VALUES,
  POINT_VALUES,
  QUESTION_TEXT_MAX,
  QUESTION_TYPE_LABELS as TYPE_LABELS,
  QUIZ_TITLE_MAX,
  TAGS_MAX,
  TIME_LIMITS_S,
  TRUE_FALSE_OPTIONS,
  csvToQuestions,
  isImageUrl,
  newQuestion,
  questionIssues,
  questionsToCsv,
  type DraftQuestion,
  type QuizSettings,
} from '@thinkwise/shared';
import { publishQuizAction, saveQuizAction, type PublishActionResult } from '@/app/(app)/quiz-actions';
import { useHostQuiz } from '@/lib/hostQuiz';
import { answerStyle } from '@/components/game/answers';
import { QuestionImage } from '@/components/game/QuestionImage';
import { QuestionText } from '@/components/game/QuestionText';
import { Modal } from '@/components/Modal';
import { StartSessionDialog } from '@/components/StartSessionDialog';
import { QuizSettingsDialog } from './QuizSettingsDialog';
import { ImportCsvDialog, type ImportOutcome } from '@/components/ImportCsvDialog';
import { Switch } from '@/components/Switch';

function timeLabel(s: number) {
  if (s < 60) return `${s} seconds`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m} ${m === 1 ? 'minute' : 'minutes'}${rest ? ` ${rest} seconds` : ''}`;
}

function pointsLabel(p: number) {
  if (p === 0) return 'No points';
  if (p === 1000) return '1000 (standard)';
  if (p === 2000) return '2000 (double)';
  return String(p);
}

const freshQuestion = (type: DraftQuestion['type'] = 'mc') => newQuestion(type, crypto.randomUUID());

const SELECT_CLASS =
  'h-10 w-full rounded-xl border border-app bg-surface px-3 text-sm font-medium focus:border-nova-400 focus:outline-none';
const ICON_BTN =
  'inline-flex size-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-app disabled:opacity-40';
const TEXTAREA_CLASS =
  'w-full resize-y rounded-xl border border-app bg-surface px-3 py-2 text-sm font-normal focus:border-nova-400 focus:outline-none';
const INPUT_CLASS =
  'w-full rounded-xl border border-app bg-surface px-3 py-2 text-sm font-normal focus:border-nova-400 focus:outline-none focus:ring-4 focus:ring-nova-500/15';

const HISTORY_LIMIT = 100;
// Keystrokes in the same field within this window undo as one step.
const GROUP_MS = 1000;

interface Doc {
  title: string;
  description: string;
  settings: QuizSettings;
  questions: DraftQuestion[];
}

interface History {
  past: Doc[];
  present: Doc;
  future: Doc[];
  groupKey: string | null;
  groupAt: number;
}

export interface EditorQuiz {
  id: string;
  title: string;
  description: string;
  questions: DraftQuestion[];
  settings: QuizSettings;
  status: 'draft' | 'published';
}

export function QuizEditor({ quiz }: { quiz: EditorQuiz }) {
  const router = useRouter();
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: {
      title: quiz.title,
      description: quiz.description,
      settings: quiz.settings,
      questions: quiz.questions.length ? quiz.questions : [freshQuestion()],
    },
    future: [],
    groupKey: null,
    groupAt: 0,
  }));
  const { title, questions } = history.present;
  const [selectedId, setSelectedId] = useState(() => questions[0]!.id);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isPublished, setIsPublished] = useState(quiz.status === 'published');
  const [publishing, setPublishing] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  const [publishFailure, setPublishFailure] = useState<Extract<PublishActionResult, { ok: false }> | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const { host, pending: hosting, failure, clearFailure } = useHostQuiz();

  const commit = useCallback((change: (doc: Doc) => Doc, groupKey: string | null = null) => {
    const now = Date.now();
    setHistory((h) => {
      const next = change(h.present);
      if (next === h.present) return h;
      const grouped = groupKey !== null && groupKey === h.groupKey && now - h.groupAt < GROUP_MS;
      return {
        past: grouped ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        groupKey,
        groupAt: now,
      };
    });
  }, []);

  const undo = useCallback(
    () =>
      setHistory((h) =>
        h.past.length
          ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future], groupKey: null, groupAt: 0 }
          : h,
      ),
    [],
  );
  const redo = useCallback(
    () =>
      setHistory((h) =>
        h.future.length
          ? { past: [...h.past, h.present], present: h.future[0]!, future: h.future.slice(1), groupKey: null, groupAt: 0 }
          : h,
      ),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || document.querySelector('dialog[open]')) return;
      const key = e.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        e.preventDefault();
        if (key === 'y' || e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  useEffect(() => {
    if (failure) setStartOpen(false);
  }, [failure]);

  const setTitle = (value: string) => commit((d) => ({ ...d, title: value }), 'title');
  const setDescription = (value: string) => commit((d) => ({ ...d, description: value }), 'description');
  const setSettings = (patch: Partial<QuizSettings>, groupKey: string | null = null) =>
    commit((d) => ({ ...d, settings: { ...d.settings, ...patch } }), groupKey);
  const setQuestions = (change: (qs: DraftQuestion[]) => DraftQuestion[], groupKey: string | null = null) =>
    commit((d) => ({ ...d, questions: change(d.questions) }), groupKey);

  // Autosave: compare a snapshot of what's on screen with what the server last accepted.
  const snapshot = useMemo(() => JSON.stringify(history.present), [history.present]);
  const initialSnapshot = useRef(
    JSON.stringify({ title: quiz.title, description: quiz.description, settings: quiz.settings, questions: quiz.questions }),
  );
  const [savedSnapshot, setSavedSnapshot] = useState(initialSnapshot.current);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef(snapshot);
  const saved = useRef(initialSnapshot.current);
  const inflight = useRef<Promise<boolean> | null>(null);
  const dirty = snapshot !== savedSnapshot;

  useEffect(() => {
    latest.current = snapshot;
  }, [snapshot]);

  const flush = useCallback(async (): Promise<boolean> => {
    while (inflight.current) await inflight.current;
    const body = latest.current;
    if (body === saved.current) return true;
    setSaving(true);
    const request = saveQuizAction(quiz.id, JSON.parse(body) as unknown)
      .then((result) => {
        if (!result.ok) {
          setSaveError(result.error);
          return false;
        }
        saved.current = body;
        setSavedSnapshot(body);
        setSaveError(null);
        return true;
      })
      .catch(() => {
        setSaveError('Couldn’t reach the server.');
        return false;
      });
    inflight.current = request;
    const ok = await request;
    inflight.current = null;
    setSaving(false);
    if (!ok) return false;
    return latest.current === saved.current ? true : flush();
  }, [quiz.id]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void flush(), 800);
    return () => clearTimeout(timer);
  }, [snapshot, dirty, flush]);

  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);

  const index = Math.max(
    0,
    questions.findIndex((q) => q.id === selectedId),
  );
  const current = questions[index]!;

  const updateCurrent = (patch: Partial<DraftQuestion>, groupKey: string | null = null) =>
    setQuestions((qs) => qs.map((q) => (q.id === current.id ? { ...q, ...patch } : q)), groupKey);

  const move = (from: number, to: number) =>
    setQuestions((qs) => {
      const next = [...qs];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });

  const duplicate = (i: number) => {
    if (questions.length >= MAX_QUESTIONS) return;
    const copy = {
      ...questions[i]!,
      id: crypto.randomUUID(),
      options: [...questions[i]!.options],
      correct: [...questions[i]!.correct],
      accepted: [...questions[i]!.accepted],
    };
    setQuestions((qs) => [...qs.slice(0, i + 1), copy, ...qs.slice(i + 1)]);
    setSelectedId(copy.id);
  };

  const remove = (i: number) => {
    if (questions.length <= 1) return;
    const target = questions[i]!;
    if (target.id === current.id) setSelectedId(questions[i + 1]?.id ?? questions[i - 1]!.id);
    setQuestions((qs) => qs.filter((q) => q.id !== target.id));
  };

  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) return;
    const q = freshQuestion();
    setQuestions((qs) => [...qs, q]);
    setSelectedId(q.id);
  };

  const changeType = (type: DraftQuestion['type']) => {
    if (type === current.type) return;
    if (type === 'tf') return updateCurrent({ type, options: [...TRUE_FALSE_OPTIONS], correct: [0] });
    // Answers typed for a choice question survive a switch to another choice type and back.
    const options = current.type === 'tf' ? ['', '', '', ''] : current.options;
    if (type === 'text') {
      return updateCurrent({ type, options, correct: [], accepted: current.accepted.length ? current.accepted : [''] });
    }
    if (type === 'numeric' || type === 'blanks' || type === 'rating') return updateCurrent({ type, options, correct: [] });
    if (type === 'order') return updateCurrent({ type, options: current.type === 'tf' ? ['', '', ''] : options, correct: [] });
    if (type === 'poll') return updateCurrent({ type, options, correct: [] });
    const kept = usesOptions(current.type) && current.type !== 'tf' ? current.correct : [];
    updateCurrent({ type, options, correct: type === 'mc' ? [kept[0] ?? 0] : kept.length ? kept : [0] });
  };

  const setOption = (i: number, value: string) =>
    updateCurrent({ options: current.options.map((o, j) => (j === i ? value : o)) }, `option:${current.id}:${i}`);

  const moveOption = (from: number, to: number) => {
    const options = [...current.options];
    [options[from], options[to]] = [options[to]!, options[from]!];
    updateCurrent({ options });
  };

  const removeOption = (i: number) => {
    if (current.options.length <= MIN_OPTIONS) return;
    const correct = current.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c));
    updateCurrent({ options: current.options.filter((_, j) => j !== i), correct });
  };

  const toggleCorrect = (i: number) =>
    updateCurrent({
      correct: current.correct.includes(i) ? current.correct.filter((c) => c !== i) : [...current.correct, i].sort((a, b) => a - b),
    });

  const setAccepted = (i: number, value: string) =>
    updateCurrent({ accepted: current.accepted.map((a, j) => (j === i ? value : a)) }, `accepted:${current.id}:${i}`);

  const blankCount = Math.min(countBlanks(current.text), MAX_BLANKS);
  // Keys for blanks beyond the ___ currently in the text are kept, so deleting and retyping a blank loses nothing.
  const blankKey = (i: number) => current.blanks[i] ?? [''];
  const setBlanks = (change: (blanks: string[][]) => string[][], groupKey: string | null = null) => {
    const padded = Array.from({ length: Math.max(blankCount, current.blanks.length) }, (_, i) => [...blankKey(i)]);
    updateCurrent({ blanks: change(padded) }, groupKey);
  };

  const insertBlank = () => {
    if (blankCount >= MAX_BLANKS) return;
    const text = current.text.trimEnd();
    updateCurrent({ text: `${text}${text ? ' ' : ''}___ `.slice(0, QUESTION_TEXT_MAX) });
  };

  const setNumber = (field: 'numericAnswer' | 'tolerance', raw: string) => {
    const n = raw.trim() === '' ? null : Number(raw);
    if (n !== null && (!Number.isFinite(n) || Math.abs(n) > NUMBER_LIMIT)) return;
    if (field === 'tolerance') updateCurrent({ tolerance: Math.abs(n ?? 0) }, `tolerance:${current.id}`);
    else updateCurrent({ numericAnswer: n }, `numeric:${current.id}`);
  };

  const goBack = async (e: React.MouseEvent) => {
    e.preventDefault();
    await flush();
    router.push('/library');
  };

  const publish = async () => {
    setPublishing(true);
    setPublishFailure(null);
    clearFailure();
    try {
      if (!(await flush())) return;
      const result = await publishQuizAction(quiz.id);
      if (result.ok) {
        setIsPublished(true);
        setJustPublished(true);
      } else {
        setPublishFailure(result);
      }
    } catch {
      setPublishFailure({ ok: false, error: 'Couldn’t reach the server. Please try again.' });
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    if (!justPublished) return;
    const timer = setTimeout(() => setJustPublished(false), 2500);
    return () => clearTimeout(timer);
  }, [justPublished]);

  const shownFailure = publishFailure ?? failure;
  const dismissFailure = () => {
    setPublishFailure(null);
    clearFailure();
  };

  const importCsv = async (text: string): Promise<ImportOutcome | void> => {
    const { questions: incoming, errors } = csvToQuestions(text, () => crypto.randomUUID());
    if (errors.length) {
      return { error: `${errors.length} ${errors.length === 1 ? 'row needs' : 'rows need'} fixing. Nothing was imported.`, errors };
    }
    const blankStart = questions.length === 1 && !questions[0]!.text.trim() && questions[0]!.options.every((o) => !o.trim());
    const base = blankStart ? [] : questions;
    if (base.length + incoming.length > MAX_QUESTIONS) {
      return { error: `That would make ${base.length + incoming.length} questions; a quiz holds at most ${MAX_QUESTIONS}.` };
    }
    setQuestions(() => [...base, ...incoming]);
    setSelectedId(incoming[0]!.id);
    setImportOpen(false);
  };

  const exportCsv = () => {
    const blob = new Blob([`\uFEFF${questionsToCsv(questions)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title.trim() || 'quiz').replace(/[\\/:*?"<>|]+/g, '').slice(0, 80)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const issues = questionIssues(current);
  const isTf = current.type === 'tf';
  const isMulti = current.type === 'multi';
  const isText = current.type === 'text';
  const isNumeric = current.type === 'numeric';
  const isBlanks = current.type === 'blanks';
  const isOrder = current.type === 'order';
  const isRating = current.type === 'rating';
  const isPoll = current.type === 'poll';
  const scored = isScored(current.type);

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100dvh-57px)] flex-col sm:-mx-6 lg:-mx-10 lg:-my-10 lg:min-h-dvh">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-app bg-surface/95 px-3 py-2 backdrop-blur sm:px-4">
        <Link href="/library" onClick={goBack} aria-label="Back to library" className="rounded-lg p-2 text-muted hover:bg-surface-2">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <label htmlFor="quiz-title" className="sr-only">
          Quiz title
        </label>
        <input
          id="quiz-title"
          value={title}
          maxLength={QUIZ_TITLE_MAX}
          placeholder="Name your quiz"
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-[12rem] flex-1 rounded-lg bg-transparent px-2 py-1.5 font-display text-lg font-bold hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
        />
        <span role="status" className="flex items-center gap-1.5 px-2 text-xs font-semibold text-muted">
          {saveError && !saving ? (
            <>
              <CloudOff className="size-3.5 text-coral-600" aria-hidden="true" />
              <span className="text-coral-600">Not saved</span>
              <button type="button" onClick={() => void flush()} className="rounded-md px-1.5 py-0.5 text-nova-700 underline hover:bg-surface-2 dark:text-nova-300">
                Retry
              </button>
            </>
          ) : dirty || saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            <>
              <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
              Saved
            </>
          )}
        </span>
        <div className="flex items-center">
          <button type="button" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!history.past.length} onClick={undo} className={ICON_BTN}>
            <Undo2 className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Redo (Ctrl+Shift+Z)"
            title="Redo (Ctrl+Shift+Z)"
            disabled={!history.future.length}
            onClick={redo}
            className={ICON_BTN}
          >
            <Redo2 className="size-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Import questions from CSV" title="Import questions from CSV" onClick={() => setImportOpen(true)} className={ICON_BTN}>
            <FileUp className="size-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Export questions as CSV" title="Export questions as CSV" onClick={exportCsv} className={ICON_BTN}>
            <Download className="size-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Quiz settings" title="Quiz settings" onClick={() => setSettingsOpen(true)} className={ICON_BTN}>
            <Settings className="size-4" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="inline-flex h-8 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-app bg-surface px-3 text-sm font-semibold text-app transition-all duration-200 hover:-translate-y-0.5 hover:border-nova-400 hover:text-nova-700 active:scale-[0.97] dark:hover:text-nova-300"
        >
          <Eye className="size-4" aria-hidden="true" />
          Preview
        </button>
        <button
          type="button"
          disabled={publishing}
          onClick={() => void publish()}
          className={`inline-flex h-8 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 ${
            isPublished
              ? 'bg-surface-2 text-app hover:bg-nova-100 dark:hover:bg-ink-700'
              : 'bg-nova-600 text-white shadow-[0_6px_20px_-8px_rgb(90_47_242/0.7)] hover:bg-nova-700 active:bg-nova-800'
          }`}
        >
          {publishing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : justPublished ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Rocket className="size-4" aria-hidden="true" />
          )}
          <span aria-live="polite">{justPublished ? 'Published' : isPublished ? 'Publish update' : 'Publish'}</span>
        </button>
        <button
          type="button"
          disabled={hosting}
          onClick={() => setStartOpen(true)}
          className="inline-flex h-8 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] px-3 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgb(255_93_115/0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          {hosting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          Host
        </button>
      </header>

      {shownFailure && (
        <div role="alert" className="flex items-start gap-3 border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{shownFailure.error}</p>
            {shownFailure.problems && shownFailure.problems.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {shownFailure.problems.map((p) => (
                  <li key={p.index}>
                    <button
                      type="button"
                      onClick={() => questions[p.index] && setSelectedId(questions[p.index]!.id)}
                      className="underline-offset-2 hover:underline"
                    >
                      Question {p.index + 1}: {p.issues[0]}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={dismissFailure} aria-label="Dismiss" className="rounded-lg p-1 hover:bg-rose-100 dark:hover:bg-rose-900/50">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-col lg:flex-row">
        <aside aria-label="Questions" className="border-b border-app bg-surface lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <p className="text-sm font-semibold text-muted">
              {questions.length} {questions.length === 1 ? 'question' : 'questions'}
            </p>
          </div>
          <ol className="flex gap-2 overflow-x-auto px-3 pb-3 lg:max-h-[calc(100dvh-180px)] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
            {questions.map((q, i) => {
              const active = q.id === current.id;
              const problems = questionIssues(q).length;
              return (
                <li
                  key={q.id}
                  className={`group relative w-44 shrink-0 cursor-pointer rounded-2xl border-2 p-3 transition lg:w-auto ${
                    active ? 'border-nova-500 bg-surface shadow-soft' : 'border-transparent bg-surface-2 hover:border-nova-200 dark:hover:border-ink-600'
                  }`}
                >
                  <button type="button" onClick={() => setSelectedId(q.id)} aria-current={active ? 'true' : undefined} className="block w-full text-left">
                    <span className="flex items-center gap-2 text-xs font-semibold text-muted">
                      {i + 1} · {TYPE_LABELS[q.type]}
                      {problems > 0 && (
                        <span className="ml-auto flex items-center gap-1 text-coral-600 dark:text-coral-400" title={questionIssues(q).join(', ')}>
                          <AlertCircle className="size-3.5" aria-hidden="true" />
                          <span className="sr-only">Needs attention</span>
                        </span>
                      )}
                    </span>
                    <span className={`mt-1 line-clamp-2 block text-sm font-semibold ${q.text.trim() ? '' : 'text-muted'}`}>
                      {q.text.trim() || 'Untitled question'}
                    </span>
                  </button>
                  <div className="mt-2 flex items-center justify-between opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                    <span className="flex">
                      <button
                        type="button"
                        aria-label={`Move question ${i + 1} up`}
                        disabled={i === 0}
                        onClick={() => move(i, i - 1)}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30"
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move question ${i + 1} down`}
                        disabled={i === questions.length - 1}
                        onClick={() => move(i, i + 1)}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30"
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </button>
                    </span>
                    <span className="flex">
                      <button
                        type="button"
                        aria-label={`Duplicate question ${i + 1}`}
                        disabled={questions.length >= MAX_QUESTIONS}
                        onClick={() => duplicate(i)}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-app disabled:opacity-30"
                      >
                        <Copy className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete question ${i + 1}`}
                        disabled={questions.length <= 1}
                        onClick={() => remove(i)}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-coral-600 disabled:opacity-30"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
            <li className="w-44 shrink-0 lg:w-auto">
              <button
                type="button"
                onClick={addQuestion}
                disabled={questions.length >= MAX_QUESTIONS}
                className="flex h-full min-h-20 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-app text-sm font-semibold text-muted hover:border-nova-400 hover:text-nova-700 disabled:opacity-40 dark:hover:text-nova-300"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add question
              </button>
            </li>
          </ol>
        </aside>

        <section aria-label={`Question ${index + 1}`} className="flex-1 overflow-y-auto bg-app px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-3xl space-y-4">
            <div className="rounded-3xl border border-app bg-surface p-5 shadow-soft">
              <label htmlFor="question-text" className="sr-only">
                Question text
              </label>
              <textarea
                id="question-text"
                rows={2}
                value={current.text}
                maxLength={QUESTION_TEXT_MAX}
                placeholder="Type your question"
                onChange={(e) => updateCurrent({ text: e.target.value }, `text:${current.id}`)}
                className="w-full resize-none bg-transparent text-center font-display text-2xl font-bold leading-snug placeholder:text-muted/60 focus:outline-none"
              />
              <div className="mt-3 flex items-center gap-2 border-t border-app pt-3">
                <ImageIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <label htmlFor="question-image" className="sr-only">
                  Image link
                </label>
                <input
                  id="question-image"
                  type="url"
                  inputMode="url"
                  value={current.imageUrl}
                  maxLength={IMAGE_URL_MAX}
                  placeholder="Image link (optional), e.g. https://…/picture.jpg"
                  onChange={(e) => updateCurrent({ imageUrl: e.target.value }, `image:${current.id}`)}
                  className="w-full bg-transparent text-sm focus:outline-none"
                />
              </div>
              {current.imageUrl.trim() && isImageUrl(current.imageUrl.trim()) && (
                <div className="mt-3">
                  <QuestionImage key={current.imageUrl.trim()} url={current.imageUrl.trim()} className="max-h-48" />
                </div>
              )}
            </div>

            {isOrder ? (
              <div className="space-y-3 rounded-2xl border border-app bg-surface p-4">
                <p className="text-sm text-muted">
                  Enter the items in the <strong className="text-app">right order</strong>. Players get them mixed up and
                  have to put them back.
                </p>
                <ol className="space-y-2">
                  {current.options.map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-nova-100 text-sm font-bold text-nova-800 dark:bg-nova-900 dark:text-nova-200">
                        {i + 1}
                      </span>
                      <input
                        aria-label={`Item ${i + 1}`}
                        placeholder={`Item ${i + 1}`}
                        value={item}
                        maxLength={OPTION_TEXT_MAX}
                        onChange={(e) => setOption(i, e.target.value)}
                        className={INPUT_CLASS}
                      />
                      <button
                        type="button"
                        aria-label={`Move item ${i + 1} up`}
                        disabled={i === 0}
                        onClick={() => moveOption(i, i - 1)}
                        className={ICON_BTN}
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move item ${i + 1} down`}
                        disabled={i === current.options.length - 1}
                        onClick={() => moveOption(i, i + 1)}
                        className={ICON_BTN}
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove item ${i + 1}`}
                        disabled={current.options.length <= MIN_OPTIONS}
                        onClick={() => removeOption(i)}
                        className={ICON_BTN}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ol>
                {current.options.length < MAX_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => updateCurrent({ options: [...current.options, ''] })}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-app text-sm font-semibold text-muted transition hover:border-nova-400 hover:text-nova-700 dark:hover:text-nova-300"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Add item
                  </button>
                )}
                <Switch
                  checked={current.partialCredit}
                  onChange={(partialCredit) => updateCurrent({ partialCredit })}
                  label="Partial credit"
                  description="Award a share of the points for each item in the right place."
                />
              </div>
            ) : isRating ? (
              <div className="space-y-4 rounded-2xl border border-app bg-surface p-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5 text-sm font-semibold">
                    From
                    <select
                      value={current.ratingMin}
                      onChange={(e) => updateCurrent({ ratingMin: Number(e.target.value) })}
                      className={SELECT_CLASS}
                    >
                      {RATING_MIN_VALUES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1.5 text-sm font-semibold">
                    To
                    <select
                      value={current.ratingMax}
                      onChange={(e) => updateCurrent({ ratingMax: Number(e.target.value) })}
                      className={SELECT_CLASS}
                    >
                      {RATING_MAX_VALUES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="text-xs text-muted">
                  Players tap a number. The big screen shows how the room rated it and the average. Ratings are never scored.
                </p>
              </div>
            ) : isNumeric ? (
              <div className="grid gap-3 rounded-2xl border border-app bg-surface p-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm font-semibold">
                  Correct answer
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={current.numericAnswer ?? ''}
                    placeholder="e.g. 150"
                    onChange={(e) => setNumber('numericAnswer', e.target.value)}
                    className={`${INPUT_CLASS} tabular-nums`}
                  />
                </label>
                <label className="block space-y-1.5 text-sm font-semibold">
                  Accept ± (margin)
                  <input
                    type="number"
                    step="any"
                    min={0}
                    inputMode="decimal"
                    value={current.tolerance}
                    onChange={(e) => setNumber('tolerance', e.target.value)}
                    className={`${INPUT_CLASS} tabular-nums`}
                  />
                </label>
                <p className="text-xs text-muted sm:col-span-2">
                  {current.numericAnswer === null
                    ? 'Players type a number on their phone.'
                    : current.tolerance > 0
                      ? `Anything from ${current.numericAnswer - current.tolerance} to ${current.numericAnswer + current.tolerance} counts as right.`
                      : `Only exactly ${current.numericAnswer} counts as right. Add a margin to accept close answers.`}
                </p>
              </div>
            ) : isBlanks ? (
              <div className="space-y-4 rounded-2xl border border-app bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 text-sm text-muted">
                    Type <code className="rounded bg-surface-2 px-1">___</code> (three underscores) in the question wherever a
                    blank goes, then give the accepted answers for each one.
                  </p>
                  <button
                    type="button"
                    onClick={insertBlank}
                    disabled={blankCount >= MAX_BLANKS}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-app px-3 text-sm font-semibold hover:border-nova-400 disabled:opacity-40"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Insert blank
                  </button>
                </div>
                {Array.from({ length: blankCount }, (_, b) => (
                  <fieldset key={b} className="space-y-2 rounded-xl bg-surface-2/60 p-3">
                    <legend className="sr-only">Blank {b + 1}</legend>
                    <p aria-hidden="true" className="text-sm font-semibold">
                      Blank {b + 1}
                    </p>
                    {blankKey(b).map((answer, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          aria-label={`Blank ${b + 1}, accepted answer ${i + 1}`}
                          placeholder={i === 0 ? 'Accepted answer' : 'Another spelling or form'}
                          value={answer}
                          maxLength={ANSWER_TEXT_MAX}
                          onChange={(e) =>
                            setBlanks(
                              (all) => all.map((list, j) => (j === b ? list.map((a, k) => (k === i ? e.target.value : a)) : list)),
                              `blank:${current.id}:${b}:${i}`,
                            )
                          }
                          className={INPUT_CLASS}
                        />
                        <button
                          type="button"
                          aria-label={`Remove blank ${b + 1} answer ${i + 1}`}
                          disabled={blankKey(b).length <= 1}
                          onClick={() => setBlanks((all) => all.map((list, j) => (j === b ? list.filter((_, k) => k !== i) : list)))}
                          className="rounded-lg p-2 text-muted hover:bg-surface-2 disabled:opacity-30"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    {blankKey(b).length < MAX_ACCEPTED && (
                      <button
                        type="button"
                        onClick={() => setBlanks((all) => all.map((list, j) => (j === b ? [...list, ''] : list)))}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-nova-700 hover:underline dark:text-nova-300"
                      >
                        <Plus className="size-4" aria-hidden="true" />
                        Add alternative
                      </button>
                    )}
                  </fieldset>
                ))}
                <Switch
                  checked={current.partialCredit}
                  onChange={(partialCredit) => updateCurrent({ partialCredit })}
                  label="Partial credit"
                  description="Award a share of the points for each blank filled in correctly."
                />
                <Switch
                  checked={current.caseSensitive}
                  onChange={(caseSensitive) => updateCurrent({ caseSensitive })}
                  label="Case sensitive"
                  description="Only count answers with exactly the same capital letters."
                />
              </div>
            ) : isText ? (
              <div className="space-y-3 rounded-2xl border border-app bg-surface p-4">
                <div>
                  <p className="text-sm font-semibold">Accepted answers</p>
                  <p className="text-xs text-muted">
                    A player is right if they type any of these. Extra spaces never matter, and capital letters only matter if you
                    switch on case sensitivity.
                  </p>
                </div>
                {current.accepted.map((answer, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      aria-label={`Accepted answer ${i + 1}`}
                      placeholder={i === 0 ? 'e.g. Na' : 'Another spelling or form'}
                      value={answer}
                      maxLength={ANSWER_TEXT_MAX}
                      onChange={(e) => setAccepted(i, e.target.value)}
                      className="w-full rounded-xl border border-app bg-surface px-3 py-2 text-sm focus:border-nova-400 focus:outline-none focus:ring-4 focus:ring-nova-500/15"
                    />
                    <button
                      type="button"
                      aria-label={`Remove accepted answer ${i + 1}`}
                      disabled={current.accepted.length <= 1}
                      onClick={() => updateCurrent({ accepted: current.accepted.filter((_, j) => j !== i) })}
                      className="rounded-lg p-2 text-muted hover:bg-surface-2 disabled:opacity-30"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {current.accepted.length < MAX_ACCEPTED && (
                  <button
                    type="button"
                    onClick={() => updateCurrent({ accepted: [...current.accepted, ''] })}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-app text-sm font-semibold text-muted transition hover:border-nova-400 hover:text-nova-700 dark:hover:text-nova-300"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Add another accepted answer
                  </button>
                )}
                <Switch
                  checked={current.caseSensitive}
                  onChange={(caseSensitive) => updateCurrent({ caseSensitive })}
                  label="Case sensitive"
                  description="Only count answers with exactly the same capital letters, e.g. pH."
                />
              </div>
            ) : (
              <div className="space-y-3">
                {!isPoll && <p className="text-sm text-muted">{isMulti ? 'Tick every correct answer.' : 'Tick the correct answer.'}</p>}
                <div
                  role={isPoll ? 'group' : isMulti ? 'group' : 'radiogroup'}
                  aria-label={isPoll ? 'Poll options' : isMulti ? 'Correct answers' : 'Correct answer'}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {current.options.map((option, i) => {
                    const style = answerStyle(i);
                    const checked = isMulti ? current.correct.includes(i) : current.correct[0] === i;
                    const name = isTf ? option : `answer ${style.letter}`;
                    return (
                      <div key={i} className={`flex items-center gap-2 rounded-2xl p-2 pl-3 text-white shadow-soft ${style.bg}`}>
                        <style.Icon className="size-5 shrink-0" aria-hidden="true" />
                        {isTf ? (
                          <span className="min-w-0 flex-1 py-2 font-semibold">{option}</span>
                        ) : (
                          <input
                            aria-label={`Answer ${style.letter}`}
                            placeholder={`Answer ${style.letter}`}
                            value={option}
                            maxLength={OPTION_TEXT_MAX}
                            onChange={(e) => setOption(i, e.target.value)}
                            className="min-w-0 flex-1 bg-transparent py-2 font-semibold text-white placeholder:text-white/60 focus:outline-none"
                          />
                        )}
                        {!isPoll && (
                          <button
                            type="button"
                            role={isMulti ? 'checkbox' : 'radio'}
                            aria-checked={checked}
                            aria-label={`Mark ${name} as correct`}
                            onClick={() => (isMulti ? toggleCorrect(i) : updateCurrent({ correct: [i] }))}
                            className={`flex size-9 shrink-0 items-center justify-center ${isMulti ? 'rounded-lg' : 'rounded-full'} border-2 border-white/80 transition ${
                              checked ? 'bg-white text-emerald-700' : 'hover:bg-white/20'
                            }`}
                          >
                            {checked && <Check className="size-5" strokeWidth={3} aria-hidden="true" />}
                          </button>
                        )}
                        {!isTf && (
                          <button
                            type="button"
                            aria-label={`Remove answer ${style.letter}`}
                            disabled={current.options.length <= MIN_OPTIONS}
                            onClick={() => removeOption(i)}
                            className="rounded-lg p-1.5 text-white/80 hover:bg-white/20 disabled:opacity-30"
                          >
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {!isTf && current.options.length < MAX_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => updateCurrent({ options: [...current.options, ''] })}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-app text-sm font-semibold text-muted transition hover:border-nova-400 hover:text-nova-700 dark:hover:text-nova-300"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Add answer
                  </button>
                )}
                {isPoll && (
                  <div className="rounded-2xl border border-app bg-surface p-4">
                    <Switch
                      checked={current.allowMultiple}
                      onChange={(allowMultiple) => updateCurrent({ allowMultiple })}
                      label="Allow multiple choices"
                    />
                  </div>
                )}
              </div>
            )}

            {issues.length > 0 && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-semibold">Before this question can be played:</p>
                <ul className="mt-1 list-disc pl-5">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <aside aria-label="Question settings" className="space-y-5 border-t border-app bg-surface p-4 lg:w-72 lg:shrink-0 lg:border-l lg:border-t-0">
          <label className="block space-y-1.5 text-sm font-semibold">
            Question type
            <select value={current.type} onChange={(e) => changeType(e.target.value as DraftQuestion['type'])} className={SELECT_CLASS}>
              {(Object.keys(TYPE_LABELS) as DraftQuestion['type'][]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-semibold">
            Time limit
            <select value={current.timeLimitMs} onChange={(e) => updateCurrent({ timeLimitMs: Number(e.target.value) })} className={SELECT_CLASS}>
              {TIME_LIMITS_S.map((s) => (
                <option key={s} value={s * 1000}>
                  {timeLabel(s)}
                </option>
              ))}
            </select>
          </label>
          {scored ? (
            <>
              <label className="block space-y-1.5 text-sm font-semibold">
                Points
                <select value={current.points} onChange={(e) => updateCurrent({ points: Number(e.target.value) })} className={SELECT_CLASS}>
                  {POINT_VALUES.map((p) => (
                    <option key={p} value={p}>
                      {pointsLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-muted">Faster correct answers earn more of the points, plus a bonus for answer streaks.</p>
              <label className="block space-y-1.5 text-sm font-semibold">
                Negative marking (wrong answer)
                <select value={current.penalty} onChange={(e) => updateCurrent({ penalty: Number(e.target.value) })} className={SELECT_CLASS}>
                  {PENALTY_VALUES.map((p) => (
                    <option key={p} value={p}>
                      {p === 0 ? 'None' : `−${p}`}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
              {TYPE_LABELS[current.type]} questions aren’t scored, so they never change anyone’s points or streak.
            </p>
          )}
          <label className="block space-y-1.5 text-sm font-semibold">
            Difficulty
            <select
              value={current.difficulty}
              onChange={(e) => updateCurrent({ difficulty: e.target.value as DraftQuestion['difficulty'] })}
              className={SELECT_CLASS}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-semibold">
            Hint (optional)
            <textarea
              rows={1}
              value={current.hint}
              maxLength={HINT_MAX}
              onChange={(e) => updateCurrent({ hint: e.target.value }, `hint:${current.id}`)}
              className={TEXTAREA_CLASS}
            />
            <span className="block text-xs font-normal text-muted">Players can open it on their phone while the clock runs.</span>
          </label>
          <label className="block space-y-1.5 text-sm font-semibold">
            Explanation (shown after answering)
            <textarea
              rows={3}
              value={current.explanation}
              maxLength={EXPLANATION_MAX}
              onChange={(e) => updateCurrent({ explanation: e.target.value }, `explanation:${current.id}`)}
              className={TEXTAREA_CLASS}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-semibold">
            Tags (comma separated)
            <textarea
              rows={1}
              value={current.tags}
              maxLength={TAGS_MAX}
              placeholder="e.g. planets, revision"
              onChange={(e) => updateCurrent({ tags: e.target.value }, `tags:${current.id}`)}
              className={TEXTAREA_CLASS}
            />
          </label>
        </aside>
      </div>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Participant preview"
        description={`Question ${index + 1} as it appears on players’ phones. The correct answer is never sent to them.`}
        size="max-w-3xl"
      >
        <div className="mx-auto max-w-md space-y-4 rounded-3xl bg-app p-4">
          <div className="space-y-4 rounded-3xl bg-surface p-5 text-center shadow-soft">
            {current.imageUrl.trim() && isImageUrl(current.imageUrl.trim()) && (
              <QuestionImage key={current.imageUrl.trim()} url={current.imageUrl.trim()} className="max-h-48" />
            )}
            <p className={`font-display text-xl font-bold ${current.text.trim() ? '' : 'text-muted'}`}>
              {current.text.trim() ? <QuestionText text={current.text.trim()} blanks={isBlanks} /> : 'Your question appears here'}
            </p>
          </div>
          {isRating ? (
            <div className="flex flex-wrap justify-center gap-2">
              {Array.from({ length: current.ratingMax - current.ratingMin + 1 }, (_, i) => current.ratingMin + i).map((v) => (
                <div
                  key={v}
                  className="flex size-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#4a22cc,#8f6dff)] font-display text-2xl font-bold text-white"
                >
                  {v}
                </div>
              ))}
            </div>
          ) : isOrder ? (
            <div className="space-y-2">
              <p className="text-center text-sm font-semibold text-muted">Players see these mixed up and move them into order</p>
              {current.options.map((item, i) => (
                <div key={i} className="flex items-center gap-2 rounded-2xl bg-surface p-3 font-bold shadow-soft">
                  <span className="text-muted">{i + 1}.</span>
                  <span className={item.trim() ? '' : 'text-muted'}>{item.trim() || `Item ${i + 1}`}</span>
                </div>
              ))}
            </div>
          ) : !usesOptions(current.type) ? (
            <div className="space-y-3">
              {(isBlanks ? Array.from({ length: Math.max(1, blankCount) }, (_, i) => `Blank ${i + 1}`) : [isNumeric ? 'Type a number' : 'Type your answer']).map(
                (label) => (
                  <div
                    key={label}
                    className="flex h-14 w-full items-center justify-center rounded-2xl border-2 border-app bg-surface px-4 text-lg font-bold text-muted"
                  >
                    {label}
                  </div>
                ),
              )}
              <div className="flex h-14 w-full items-center justify-center rounded-2xl bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] text-lg font-bold text-white">
                Submit
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {isMulti && <p className="text-center text-sm font-semibold text-muted sm:col-span-2">Pick every right answer, then submit</p>}
              {isPoll && current.allowMultiple && (
                <p className="text-center text-sm font-semibold text-muted sm:col-span-2">Pick as many as you like, then submit</p>
              )}
              {current.options.map((option, i) => {
                const style = answerStyle(i);
                return (
                  <button
                    key={i}
                    type="button"
                    className={`group relative flex min-h-20 w-full items-center gap-3 rounded-2xl px-4 py-4 text-left text-lg font-bold text-white shadow-[0_6px_0_0_rgb(0_0_0/0.18)] transition-all active:translate-y-[3px] active:shadow-[0_3px_0_0_rgb(0_0_0/0.18)] ${style.bg}`}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/20" aria-hidden="true">
                      <style.Icon className="size-6" />
                    </span>
                    <span className="sr-only">{style.letter}.</span>
                    <span className={`min-w-0 flex-1 break-words leading-snug ${option.trim() ? '' : 'text-white/60'}`}>
                      {option.trim() || `Answer ${style.letter}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <StartSessionDialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        pending={hosting}
        onStart={(options) => host(quiz.id, flush, options)}
      />

      <QuizSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        description={history.present.description}
        settings={history.present.settings}
        onDescription={setDescription}
        onSettings={setSettings}
      />

      <ImportCsvDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        description="Adds the spreadsheet’s questions to the end of this quiz. You can undo it."
        onFile={importCsv}
      />
    </div>
  );
}
