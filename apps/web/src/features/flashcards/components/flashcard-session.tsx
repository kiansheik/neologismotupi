import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CompactAudioPlayer, AudioCapture } from "@/features/audio/components";
import { uploadEntryAudio } from "@/features/audio/api";
import { useI18n } from "@/i18n";
import { useOrthography } from "@/lib/orthography";
import { trackEvent } from "@/lib/analytics";
import type { FlashcardCard, FlashcardGrade } from "@/lib/types";

function normalizeAnswer(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Strips whitespace and hyphens — used for the exact-match "good" check
function normalizeStrict(s: string): string {
  return s.toLowerCase().replace(/[\s\-]+/g, "");
}

// ─── Diff engine ─────────────────────────────────────────────────────────────

type DiffOp =
  | { type: "equal"; char: string }
  | { type: "replace"; user: string; expected: string }
  | { type: "insert"; char: string } // extra char typed by user
  | { type: "delete"; char: string }; // char in expected that user missed

function buildDpMatrix(a: string, b: string): number[][] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function computeDiff(user: string, expected: string): DiffOp[] {
  const dp = buildDpMatrix(user, expected);
  const ops: DiffOp[] = [];
  let i = user.length, j = expected.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && user[i - 1] === expected[j - 1]) {
      ops.push({ type: "equal", char: user[i - 1] });
      i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.push({ type: "replace", user: user[i - 1], expected: expected[j - 1] });
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ type: "insert", char: user[i - 1] });
      i--;
    } else {
      ops.push({ type: "delete", char: expected[j - 1] });
      j--;
    }
  }
  return ops.reverse();
}

// Non-breaking space — same width as any char in monospace, won't collapse in HTML
const PH = "\u00a0";

function AnswerDiff({ userInput, expected }: { userInput: string; expected: string }) {
  const a = normalizeAnswer(userInput);
  const b = normalizeAnswer(expected);

  if (!a) {
    // Nothing typed — show whole expected string as missing
    return (
      <div className="rounded border border-line-soft bg-surface/70 px-3 py-2 font-mono text-base leading-6">
        <div className="text-ink-muted opacity-50">{PH}</div>
        <div>
          {b.split("").map((ch, i) => (
            <span key={i} className="rounded-sm bg-amber-100 text-amber-800 underline">
              {ch}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const ops = computeDiff(a, b);

  return (
    <div className="rounded border border-line-soft bg-surface/70 px-3 py-2 font-mono text-base leading-6">
      {/* Row 1 — user's answer */}
      <div className="whitespace-pre-wrap">
        {ops.map((op, i) => {
          if (op.type === "equal")
            return (
              <span key={i} className="text-green-700">
                {op.char}
              </span>
            );
          if (op.type === "replace")
            return (
              <span key={i} className="rounded-sm bg-red-100 text-red-700">
                {op.user}
              </span>
            );
          if (op.type === "insert")
            return (
              <span key={i} className="text-red-400 line-through">
                {op.char}
              </span>
            );
          // delete — invisible placeholder keeps column aligned with expected row
          return (
            <span key={i} className="invisible">
              {PH}
            </span>
          );
        })}
      </div>
      {/* Row 2 — expected answer */}
      <div className="whitespace-pre-wrap">
        {ops.map((op, i) => {
          if (op.type === "equal")
            return (
              <span key={i} className="text-green-700">
                {op.char}
              </span>
            );
          if (op.type === "replace")
            return (
              <span key={i} className="rounded-sm bg-amber-100 text-amber-800 underline">
                {op.expected}
              </span>
            );
          if (op.type === "insert")
            // invisible placeholder keeps column aligned with user row
            return (
              <span key={i} className="invisible">
                {PH}
              </span>
            );
          return (
            <span key={i} className="rounded-sm bg-amber-100 text-amber-800 underline">
              {op.char}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Auto-grader ─────────────────────────────────────────────────────────────

function splitExpectedOptions(expected: string): string[] {
  const options = expected
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean);
  return options.length ? options : [expected];
}

function computeAutoGrade(
  userResponse: string,
  expected: string,
): { grade: FlashcardGrade; ratio: number; expected: string } {
  const a = normalizeAnswer(userResponse);
  const options = splitExpectedOptions(expected);
  if (!a) {
    return { grade: "again", ratio: 0, expected: options[0] ?? expected };
  }

  let bestRatio = 0;
  let bestExpected = options[0] ?? expected;

  for (const option of options) {
    if (normalizeStrict(userResponse) === normalizeStrict(option)) {
      return { grade: "good", ratio: 1, expected: option };
    }
    const b = normalizeAnswer(option);
    const dp = buildDpMatrix(a, b);
    const dist = dp[a.length][b.length];
    const maxLen = Math.max(a.length, b.length);
    const ratio = maxLen === 0 ? 1 : 1 - dist / maxLen;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestExpected = option;
    }
  }

  const grade: FlashcardGrade = bestRatio >= 0.85 ? "hard" : "again";
  return { grade, ratio: bestRatio, expected: bestExpected };
}

interface FlashcardSessionProps {
  card: FlashcardCard | null;
  isLoading: boolean;
  isSubmitting: boolean;
  onReview: (grade: FlashcardGrade, responseMs: number | null, userResponse: string) => void;
  dueLaterToday?: number;
}

export function FlashcardSession({
  card,
  isLoading,
  isSubmitting,
  onReview,
  dueLaterToday = 0,
}: FlashcardSessionProps) {
  const { t, locale } = useI18n();
  const { apply } = useOrthography();
  const [userInput, setUserInput] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [gradeResult, setGradeResult] = useState<{
    grade: FlashcardGrade;
    ratio: number;
    expected: string;
  } | null>(null);
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [responseMs, setResponseMs] = useState<number | null>(null);
  const [audioSubmitted, setAudioSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!card) {
      setUserInput("");
      setSubmitted(false);
      setGradeResult(null);
      setResponseMs(null);
      setShownAt(null);
      setAudioSubmitted(false);
      return;
    }
    setUserInput("");
    setSubmitted(false);
    setGradeResult(null);
    setResponseMs(null);
    setShownAt(Date.now());
    setAudioSubmitted(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [card?.entry_id, card?.direction]);

  const expected = useMemo(() => {
    if (!card) return "";
    return card.direction === "headword_to_gloss" ? card.gloss_pt : apply(card.headword);
  }, [card, apply]);

  const prompt = useMemo(() => {
    if (!card) return "";
    return card.direction === "headword_to_gloss" ? apply(card.headword) : card.gloss_pt;
  }, [apply, card]);

  const headwordLabel = useMemo(() => {
    if (!card) return "";
    return apply(card.headword);
  }, [apply, card]);

  const promptLabel = useMemo(() => {
    if (!card) return "";
    return card.direction === "headword_to_gloss"
      ? t("flashcards.prompt.headword")
      : t("flashcards.prompt.gloss");
  }, [card, t]);

  const typeAnswerHint = useMemo(() => {
    if (!card) return "";
    return card.direction === "headword_to_gloss"
      ? t("flashcards.typeAnswerHint.gloss")
      : t("flashcards.typeAnswerHint.headword");
  }, [card, t]);

  const queueLabel = useMemo(() => {
    if (!card) return "";
    if (card.queue === "new") return t("flashcards.queue.new");
    if (card.queue === "learn" || card.queue === "day_learn") return t("flashcards.queue.learn");
    return t("flashcards.queue.review");
  }, [card, t]);

  const handleSubmit = () => {
    if (!card || submitted) return;
    const now = Date.now();
    const elapsed = shownAt ? Math.max(0, now - shownAt) : null;
    setResponseMs(elapsed);
    const result = computeAutoGrade(userInput, expected);
    setGradeResult(result);
    setSubmitted(true);
    trackEvent("flashcard_reveal", {
      entry_id: card.entry_id,
      direction: card.direction,
      queue: card.queue,
    });
  };

  const handleContinue = () => {
    if (!card || !gradeResult) return;
    onReview(gradeResult.grade, responseMs, userInput);
    trackEvent("flashcard_review_submitted", {
      entry_id: card.entry_id,
      direction: card.direction,
      queue: card.queue,
      grade: gradeResult.grade,
      response_ms: responseMs ?? undefined,
    });
  };

  useEffect(() => {
    if (!submitted || !gradeResult) {
      return;
    }

    const canOverride = gradeResult.grade !== "good" && gradeResult.grade !== "easy";

    const handleOverride = () => {
      if (!card) return;
      onReview("good", responseMs, userInput);
      trackEvent("flashcard_review_overridden", {
        entry_id: card.entry_id,
        direction: card.direction,
        queue: card.queue,
        grade: "good",
        response_ms: responseMs ?? undefined,
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || isSubmitting) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      handleContinue();
    };

    const onShortcut = (event: KeyboardEvent) => {
      if (isSubmitting) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.key === "1") {
        event.preventDefault();
        handleContinue();
      } else if (event.key === "2" && canOverride) {
        event.preventDefault();
        handleOverride();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keydown", onShortcut);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keydown", onShortcut);
    };
  }, [submitted, gradeResult, isSubmitting, responseMs, userInput, card]);

  if (isLoading) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">{t("flashcards.loading")}</p>
      </Card>
    );
  }

  if (!card) {
    return (
      <Card>
        <p className="text-lg font-semibold text-brand-900">{t("flashcards.emptyTitle")}</p>
        <p className="mt-2 text-sm text-ink-muted">{t("flashcards.emptyBody")}</p>
        {dueLaterToday > 0 ? (
          <p className="mt-3 text-xs text-ink-muted">
            {t("flashcards.emptyDueLater", { count: dueLaterToday })}
          </p>
        ) : null}
      </Card>
    );
  }

  const isSuccess =
    gradeResult && (gradeResult.grade === "good" || gradeResult.grade === "easy");
  const percentMatch = gradeResult ? Math.round(gradeResult.ratio * 100) : 0;

  return (
    <Card>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">{queueLabel}</p>
        <p className="text-xs text-ink-muted">{promptLabel}</p>
      </div>

      {/* Prompt */}
      <div className="mt-4">
        <p className="text-2xl font-semibold text-brand-900">{prompt}</p>
        {card.audio_url && card.direction === "headword_to_gloss" ? (
          <div className="mt-3 flex items-center gap-3">
            <CompactAudioPlayer
              src={card.audio_url}
              t={t}
              size="sm"
              autoPlay
              autoPlayKey={`${card.entry_id}-${card.direction}`}
            />
            <p className="text-xs text-ink-muted">{t("flashcards.audioLabel")}</p>
          </div>
        ) : null}
        {card.audio_url ? (
          <p className="mt-2 text-xs italic text-ink-muted">{t("flashcards.proTip.repeat")}</p>
        ) : null}
      </div>

      {!submitted ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs text-ink-muted">{typeAnswerHint}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              ref={inputRef}
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder={t("flashcards.typeAnswerPlaceholder")}
              className="w-full min-w-0 rounded-md border border-line-strong bg-surface-input px-3 py-2 text-sm text-brand-900 placeholder:text-ink-muted focus:border-brand-500 focus:outline-none sm:flex-1"
              autoComplete="off"
            />
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting} className="w-full sm:w-auto">
              {t("flashcards.submitAnswer")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {/* Result banner */}
          {isSuccess ? (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2">
              <p className="text-sm font-semibold text-green-800">
                {t("flashcards.result.congrats")} &mdash;{" "}
                {t("flashcards.result.matchPercent", { percent: percentMatch })}
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-sm font-semibold text-red-800">
                {t("flashcards.result.studyMore")} &mdash;{" "}
                {t("flashcards.result.matchPercent", { percent: percentMatch })}
              </p>
            </div>
          )}

          {/* Primary actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={isSuccess ? undefined : "danger"}
              onClick={handleContinue}
              disabled={isSubmitting}
            >
              <span className="flex items-center gap-2">
                {isSuccess ? t("flashcards.result.congrats") : t("flashcards.result.studyMore")}
                <span className="text-[10px] font-semibold text-ink-muted/70" aria-hidden>
                  1
                </span>
              </span>
            </Button>
            {!isSuccess ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!card) return;
                  onReview("good", responseMs, userInput);
                  trackEvent("flashcard_review_overridden", {
                    entry_id: card.entry_id,
                    direction: card.direction,
                    queue: card.queue,
                    grade: "good",
                    response_ms: responseMs ?? undefined,
                  });
                }}
                disabled={isSubmitting}
              >
                <span className="flex items-center gap-2">
                  {t("flashcards.result.overrideCorrect")}
                  <span className="text-[10px] font-semibold text-ink-muted/70" aria-hidden>
                    2
                  </span>
                </span>
              </Button>
            ) : null}
          </div>

          {/* Character-level diff */}
          <div>
            <p className="mb-1 text-xs text-ink-muted">{t("flashcards.result.yourAnswer")}</p>
            <AnswerDiff userInput={userInput} expected={gradeResult?.expected ?? expected} />
          </div>

          {/* Full answer card */}
          <div className="rounded-md border border-line-soft bg-surface/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
              {t("flashcards.answerLabel")}
            </p>
            <div className="mt-2 space-y-2 text-sm">
              <div>
                <p className="text-xs text-ink-muted">{t("flashcards.headwordLabel")}</p>
                <p className="text-base font-semibold text-brand-900">{headwordLabel}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">{t("flashcards.glossLabel")}</p>
                <p className="text-base font-semibold text-brand-900">{card.gloss_pt}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">{t("flashcards.definitionLabel")}</p>
                <p className="text-sm text-ink">{card.short_definition}</p>
              </div>
              {card.audio_url && card.direction === "gloss_to_headword" ? (
                <div className="flex items-center gap-3">
                  <CompactAudioPlayer
                    src={card.audio_url}
                    t={t}
                    size="sm"
                    autoPlay={submitted}
                    autoPlayKey={`${card.entry_id}-${card.direction}-reveal`}
                  />
                  <p className="text-xs text-ink-muted">{t("flashcards.audioLabel")}</p>
                </div>
              ) : null}
              {card.part_of_speech ? (
                <div>
                  <p className="text-xs text-ink-muted">{t("flashcards.partOfSpeechLabel")}</p>
                  <p className="text-sm text-ink">{card.part_of_speech}</p>
                </div>
              ) : null}
              <Link
                to={`/entries/${card.slug}`}
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                {t("flashcards.entryLink")}
              </Link>
            </div>
          </div>

          {/* Inline audio contribution — only shown when no audio exists */}
          {!card.audio_url && !audioSubmitted ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800">
                {t("flashcards.contributeAudio.message")}
              </p>
              <div className="mt-2">
                <AudioCapture
                  t={t}
                  locale={locale}
                  allowMultiple={false}
                  onCapture={async (file) => {
                    await uploadEntryAudio(card.entry_id, file);
                    setAudioSubmitted(true);
                  }}
                />
              </div>
            </div>
          ) : !card.audio_url && audioSubmitted ? (
            <p className="text-xs font-medium text-green-700">
              {t("flashcards.contributeAudio.recorded")}
            </p>
          ) : null}

          {/* Continue button */}
        </div>
      )}
    </Card>
  );
}
