import { splitBlanks } from '@thinkwise/shared';

/** Question text with each ___ shown as a numbered gap for fill-in-the-blanks questions. */
export function QuestionText({ text, blanks }: { text: string; blanks: boolean }) {
  if (!blanks) return <>{text}</>;
  const parts = splitBlanks(text);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <span
              className="mx-1 inline-block min-w-[2.5em] border-b-[3px] border-current px-1 text-center text-nova-600 dark:text-nova-300"
              aria-label={`blank ${i + 1}`}
            >
              {i + 1}
            </span>
          )}
        </span>
      ))}
    </>
  );
}
