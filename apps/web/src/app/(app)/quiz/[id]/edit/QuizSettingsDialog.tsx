'use client';

import {
  DESCRIPTION_MAX,
  GRACE_MS_VALUES,
  MESSAGE_MAX,
  ORG_NAME_MAX,
  QUIZ_LANGUAGES,
  SUBJECT_MAX,
  TAGS_MAX,
  THEME_SWATCHES,
  type QuizSettings,
} from '@thinkwise/shared';
import { Modal } from '@/components/Modal';
import { Switch } from '@/components/Switch';

const FIELD = 'w-full rounded-xl border border-app bg-surface px-3 py-2 text-sm font-normal focus:border-nova-400 focus:outline-none';
const LABEL = 'block space-y-1.5 text-sm font-semibold';
const HEADING = 'text-xs font-bold uppercase tracking-wider text-muted';

const LANGUAGE_LABELS: Record<QuizSettings['language'], string> = { en: 'English', hi: 'हिन्दी', mr: 'मराठी', other: 'Other' };
const VISIBILITY_HELP: Record<QuizSettings['visibility'], string> = {
  private: 'Only you can see and host this quiz.',
  unlisted: 'Anyone with the link can view it, but it isn’t listed anywhere.',
  public: 'Listed in the public library once published, so other hosts can find and copy it. Answer keys never reach players.',
};

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-xl bg-surface-2 p-1">
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              checked ? 'bg-surface text-app shadow-soft' : 'text-muted hover:text-app'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function QuizSettingsDialog({
  open,
  onClose,
  description,
  settings,
  onDescription,
  onSettings,
}: {
  open: boolean;
  onClose: () => void;
  description: string;
  settings: QuizSettings;
  onDescription: (value: string) => void;
  onSettings: (patch: Partial<QuizSettings>, groupKey?: string) => void;
}) {
  const s = settings;
  const customColour = !(THEME_SWATCHES as readonly string[]).includes(s.themeColour.toLowerCase());

  return (
    <Modal open={open} onClose={onClose} title="Quiz settings" size="max-w-3xl">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className={HEADING}>Details</h3>
          <label className={LABEL}>
            Description
            <textarea
              rows={3}
              value={description}
              maxLength={DESCRIPTION_MAX}
              placeholder="What is this quiz about?"
              onChange={(e) => onDescription(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className={LABEL}>
            Subject
            <input
              value={s.subject}
              maxLength={SUBJECT_MAX}
              placeholder="e.g. Science"
              onChange={(e) => onSettings({ subject: e.target.value }, 'subject')}
              className={FIELD}
            />
          </label>
          <label className={LABEL}>
            Language
            <select
              value={s.language}
              onChange={(e) => onSettings({ language: e.target.value as QuizSettings['language'] })}
              className={FIELD}
            >
              {QUIZ_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Tags
            <input
              value={s.tags}
              maxLength={TAGS_MAX}
              placeholder="Comma separated, e.g. revision, grade 7"
              onChange={(e) => onSettings({ tags: e.target.value }, 'quiz-tags')}
              className={FIELD}
            />
          </label>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Visibility</p>
            <Segmented
              label="Visibility"
              value={s.visibility}
              onChange={(visibility) => onSettings({ visibility })}
              options={[
                { value: 'private', label: 'Private' },
                { value: 'unlisted', label: 'Unlisted' },
                { value: 'public', label: 'Public' },
              ]}
            />
            <p className="text-xs text-muted">{VISIBILITY_HELP[s.visibility]}</p>
          </div>

          <h3 className={`pt-2 ${HEADING}`}>Branding</h3>
          <label className={LABEL}>
            Organisation name
            <input
              value={s.orgName}
              maxLength={ORG_NAME_MAX}
              placeholder="Shown to players in the lobby"
              onChange={(e) => onSettings({ orgName: e.target.value }, 'orgName')}
              className={FIELD}
            />
          </label>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Theme colour</p>
            <div className="flex flex-wrap items-center gap-2">
              {THEME_SWATCHES.map((c) => {
                const active = s.themeColour.toLowerCase() === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Theme colour ${c}`}
                    aria-pressed={active}
                    onClick={() => onSettings({ themeColour: c })}
                    className="size-9 rounded-full ring-offset-2 ring-offset-[var(--surface)] transition"
                    style={{
                      background: c,
                      boxShadow: active ? `0 0 0 3px ${c}55` : undefined,
                      outline: active ? '2px solid white' : undefined,
                    }}
                  />
                );
              })}
              <label
                className={`relative size-9 cursor-pointer overflow-hidden rounded-full border-2 border-dashed ${
                  customColour ? 'border-transparent' : 'border-app'
                }`}
                style={customColour ? { background: s.themeColour, outline: '2px solid white', boxShadow: `0 0 0 3px ${s.themeColour}55` } : undefined}
                title="Custom colour"
              >
                <span className="sr-only">Custom theme colour</span>
                <input
                  type="color"
                  value={s.themeColour}
                  onChange={(e) => onSettings({ themeColour: e.target.value.toLowerCase() }, 'themeColour')}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>
          <label className={LABEL}>
            Welcome message
            <input
              value={s.welcomeMessage}
              maxLength={MESSAGE_MAX}
              placeholder="Shown while players wait in the lobby"
              onChange={(e) => onSettings({ welcomeMessage: e.target.value }, 'welcomeMessage')}
              className={FIELD}
            />
          </label>
          <label className={LABEL}>
            Completion message
            <input
              value={s.completionMessage}
              maxLength={MESSAGE_MAX}
              placeholder="Shown when the quiz ends"
              onChange={(e) => onSettings({ completionMessage: e.target.value }, 'completionMessage')}
              className={FIELD}
            />
          </label>
        </div>

        <div className="space-y-4">
          <h3 className={HEADING}>Gameplay</h3>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Scoring</p>
            <Segmented
              label="Scoring"
              value={s.scoring}
              onChange={(scoring) => onSettings({ scoring })}
              options={[
                { value: 'speed', label: 'Speed + accuracy' },
                { value: 'accuracy', label: 'Accuracy only' },
              ]}
            />
            <p className="text-xs text-muted">
              {s.scoring === 'speed'
                ? 'A correct answer earns between half and all of its points, depending on how quickly it comes in.'
                : 'Every correct answer earns its full points, however long it takes.'}
            </p>
          </div>
          <Switch
            checked={s.gamification}
            onChange={(gamification) => onSettings({ gamification })}
            label="Gamification"
            description="Podium, confetti and celebration effects"
          />
          <Switch
            checked={s.streakBonus}
            onChange={(streakBonus) => onSettings({ streakBonus })}
            label="Streak bonus"
            description="+10% for each correct answer in a row, up to +50%"
          />
          <Switch
            checked={s.showLeaderboard}
            onChange={(showLeaderboard) => onSettings({ showLeaderboard })}
            label="Show leaderboard"
            description="Switch off for a calmer, non-competitive session"
          />
          <Switch
            checked={s.showCorrect}
            onChange={(showCorrect) => onSettings({ showCorrect })}
            label="Show correct answers"
            description="Reveal the answer and explanation after each question"
          />
          <Switch
            checked={s.shuffleQuestions}
            onChange={(shuffleQuestions) => onSettings({ shuffleQuestions })}
            label="Shuffle questions"
            description="A new order every time you host"
          />
          <Switch
            checked={s.shuffleOptions}
            onChange={(shuffleOptions) => onSettings({ shuffleOptions })}
            label="Shuffle answer options"
            description="True or false questions keep their order"
          />
          <label className={LABEL}>
            Late-answer grace period
            <select
              value={s.graceMs}
              onChange={(e) => onSettings({ graceMs: Number(e.target.value) })}
              className={FIELD}
            >
              {GRACE_MS_VALUES.map((g) => (
                <option key={g} value={g}>
                  {g === 0 ? 'None' : `${g} ms`}
                </option>
              ))}
            </select>
            <span className="block text-xs font-normal text-muted">
              Accepts answers sent just before time runs out on a slow connection.
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
}
