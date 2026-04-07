import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";

import type { Locale, TranslateFn } from "@/i18n";
import { formatBytes, formatRelativeOrDate } from "@/i18n/formatters";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-error";
import type { AudioSample } from "@/lib/types";
import { getCachedVote, resolveVote, useVoteMemoryVersion } from "@/lib/vote-memory";

export type CompactAudioPlayerProps = {
  src: string;
  t: TranslateFn;
  size?: "sm" | "md";
  className?: string;
};

export function CompactAudioPlayer({ src, t, size = "md", className }: CompactAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const sizeClass = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const iconSize = size === "sm" ? "text-sm" : "text-base";
  const baseClass =
    "inline-flex items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-brand-800 shadow-sm transition-colors hover:border-brand-500 hover:bg-brand-50";
  const activeClass =
    "border-accent bg-accent text-accent-contrast hover:bg-accent-strong hover:border-accent-strong";

  const stopPlayback = (resetState = true) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    if (resetState) {
      setIsPlaying(false);
    }
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (isPlaying) {
      stopPlayback();
      return;
    }
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => setIsPlaying(false));
    }
    setIsPlaying(true);
  };

  useEffect(() => {
    return () => {
      stopPlayback(false);
    };
  }, []);

  return (
    <div className={className}>
      <Button
        type="button"
        variant="secondary"
        className={`${baseClass} ${sizeClass} ${isPlaying ? activeClass : ""}`}
        onClick={togglePlayback}
        title={isPlaying ? t("audio.stop") : t("audio.play")}
        aria-label={isPlaying ? t("audio.stop") : t("audio.play")}
      >
        {isPlaying ? <span className={iconSize}>⏹️</span> : <span className={iconSize}>▶️</span>}
      </Button>
      <audio
        ref={audioRef}
        className="hidden"
        src={src}
        preload="metadata"
        onEnded={() => stopPlayback()}
      />
    </div>
  );
}

export type AudioCaptureProps = {
  t: TranslateFn;
  locale: Locale;
  onCapture: (file: File) => Promise<unknown> | void;
  disabled?: boolean;
  allowMultiple?: boolean;
  maxBytes?: number;
};

export function AudioCapture({
  t,
  locale,
  onCapture,
  disabled = false,
  allowMultiple = true,
  maxBytes,
}: AudioCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingRecording, setPendingRecording] = useState<{ file: File; url: string } | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const maxSize = maxBytes ?? 5 * 1024 * 1024;
  const actionGroupClass =
    "inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface-input px-2 py-1 shadow-sm";
  const iconButtonBase =
    "inline-flex h-7 w-7 items-center justify-center rounded-full bg-transparent p-0 text-brand-800 transition-colors hover:bg-surface/80 leading-none";
  const iconButtonActive = "bg-accent text-accent-contrast hover:bg-accent-strong";
  const iconButtonDanger = "bg-red-600 text-white hover:bg-red-700";

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (pendingRecording?.url) {
        URL.revokeObjectURL(pendingRecording.url);
      }
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
      }
    };
  }, [pendingRecording]);

  const validateSize = (file: File): boolean => {
    if (maxSize && file.size > maxSize) {
      setErrorMessage(t("audio.fileTooLarge", { max: formatBytes(maxSize, locale) }));
      return false;
    }
    return true;
  };

  const clearPendingRecording = () => {
    if (pendingRecording?.url) {
      URL.revokeObjectURL(pendingRecording.url);
    }
    setPendingRecording(null);
  };

  const handleCapture = async (file: File): Promise<boolean> => {
    if (!validateSize(file)) {
      return false;
    }
    setErrorMessage(null);
    try {
      const result = onCapture(file);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        setIsProcessing(true);
        await result;
      }
      return true;
    } catch (error) {
      const message =
        error instanceof ApiError ? getLocalizedApiErrorMessage(error, t) : t("audio.uploadFailed");
      setErrorMessage(message);
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    for (const file of files) {
      if (!validateSize(file)) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await handleCapture(file);
    }
  };

  const beginCountdown = () => {
    setErrorMessage(null);
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
    }
    setCountdown(3);
    let remaining = 3;
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownTimerRef.current) {
          window.clearInterval(countdownTimerRef.current);
        }
        countdownTimerRef.current = null;
        setCountdown(null);
        void startRecording();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  };

  const cancelCountdown = () => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
  };

  const startRecording = async () => {
    setErrorMessage(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setErrorMessage(t("audio.recordNotSupported"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const rawType = blob.type || "audio/webm";
        const safeType = rawType.split(";")[0] || "audio/webm";
        const url = URL.createObjectURL(blob);
        const extension = safeType.includes("ogg")
          ? "ogg"
          : safeType.includes("wav")
            ? "wav"
            : safeType.includes("mpeg")
              ? "mp3"
              : safeType.includes("mp4")
                ? "mp4"
                : safeType.includes("aac")
                  ? "aac"
                  : "webm";
        const file = new File([blob], `recording-${Date.now()}.${extension}`, {
          type: safeType,
        });
        if (!validateSize(file)) {
          URL.revokeObjectURL(url);
          return;
        }
        clearPendingRecording();
        setPendingRecording({ file, url });
      };
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      setErrorMessage(t("audio.recordPermissionDenied"));
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setIsRecording(false);
  };

  const isBusy = disabled || isProcessing;
  const hasPending = Boolean(pendingRecording);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple={allowMultiple}
          className="hidden"
          onChange={handleFilesSelected}
        />
        <div className={actionGroupClass}>
          <Button
            type="button"
            variant="secondary"
            className={iconButtonBase}
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy || isRecording || countdown !== null}
            title={t("audio.uploadButton")}
            aria-label={t("audio.uploadButton")}
          >
            <span className="text-base">📁</span>
          </Button>
          <Button
            type="button"
            variant={isRecording || countdown !== null ? "danger" : "secondary"}
            className={`${iconButtonBase} ${isRecording || countdown !== null ? iconButtonDanger : ""}`}
            onClick={() => {
              if (countdown !== null) {
                cancelCountdown();
                return;
              }
              if (isRecording) {
                stopRecording();
                return;
              }
              beginCountdown();
            }}
            disabled={isBusy}
            title={
              countdown !== null
                ? t("audio.cancelCountdown")
                : isRecording
                  ? t("audio.stopRecording")
                  : t("audio.recordButton")
            }
            aria-label={
              countdown !== null
                ? t("audio.cancelCountdown")
                : isRecording
                  ? t("audio.stopRecording")
                  : t("audio.recordButton")
            }
          >
            {countdown !== null ? (
              <span className="text-base">⏳</span>
            ) : isRecording ? (
              <span className="text-base">🔴</span>
            ) : (
              <span className="text-base">🎙️</span>
            )}
          </Button>
        </div>
        {countdown !== null ? (
          <div className="flex items-center gap-1 rounded-full bg-accent-strong px-2 py-1 text-[11px] font-semibold text-accent-contrast">
            {[3, 2, 1].map((step) => (
              <span
                key={step}
                className={`flex h-5 w-5 items-center justify-center rounded-full tabular-nums transition-all ${
                  countdown === step ? "bg-surface/30 text-white" : "opacity-50"
                }`}
              >
                {step}
              </span>
            ))}
          </div>
        ) : isRecording ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
            {t("audio.recording")}
          </span>
        ) : null}
        {isProcessing ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            {t("audio.uploading")}
          </span>
        ) : null}
      </div>
      {pendingRecording ? (
        <CompactAudioPlayer src={pendingRecording.url} t={t} size="sm" />
      ) : null}
      {hasPending ? (
        <div className={actionGroupClass}>
          <Button
            type="button"
            variant="primary"
            className={`${iconButtonBase} ${iconButtonActive}`}
            onClick={async () => {
              if (!pendingRecording) {
                return;
              }
              const ok = await handleCapture(pendingRecording.file);
              if (ok) {
                clearPendingRecording();
              }
            }}
            disabled={isBusy}
            title={t("audio.submitRecording")}
            aria-label={t("audio.submitRecording")}
          >
            <span className="text-base">📤</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={`${iconButtonBase} ${iconButtonDanger}`}
            onClick={clearPendingRecording}
            disabled={isBusy}
            title={t("audio.deleteRecording")}
            aria-label={t("audio.deleteRecording")}
          >
            <span className="text-base">❌</span>
          </Button>
        </div>
      ) : null}
      {errorMessage ? <p className="text-xs text-red-700">{errorMessage}</p> : null}
    </div>
  );
}

export type AudioSampleListProps = {
  samples: AudioSample[];
  locale: Locale;
  t: TranslateFn;
  canVote: boolean;
  currentUserId?: string | null;
  isModerator?: boolean;
  onVote?: (audioId: string, value: -1 | 1) => void;
  onDelete?: (audioId: string) => void;
  votingAudioId?: string | null;
  deletingAudioId?: string | null;
};

export function AudioSampleList({
  samples,
  locale,
  t,
  canVote,
  currentUserId,
  isModerator,
  onVote,
  onDelete,
  votingAudioId,
  deletingAudioId,
}: AudioSampleListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  useVoteMemoryVersion();
  useEffect(() => {
    if (!confirmDeleteId) {
      return;
    }
    const stillExists = samples.some((sample) => sample.id === confirmDeleteId);
    if (!stillExists) {
      setConfirmDeleteId(null);
    }
  }, [samples, confirmDeleteId]);

  if (!samples.length) {
    return <p className="text-xs text-slate-600">{t("audio.noSamples")}</p>;
  }

  return (
    <div className="space-y-2">
      {samples.map((sample) => {
        const canDelete = Boolean(isModerator || (currentUserId && currentUserId === sample.user_id));
        const isVoting = votingAudioId === sample.id;
        const isDeleting = deletingAudioId === sample.id;
        const canVoteOnSample = canVote && sample.user_id !== currentUserId;
        const audioVote = resolveVote(
          sample.current_user_vote,
          getCachedVote(currentUserId, "audio", sample.id),
        );
        const uploaderLabel = sample.uploader_display_name ?? t("audio.unknownUploader");
        const uploaderUrl = sample.uploader_profile_url ?? null;
        const isConfirmingDelete = confirmDeleteId === sample.id;
        return (
          <div key={sample.id} className="rounded-md border border-brand-100 bg-surface/70 p-2">
            <div className="flex flex-wrap items-center gap-3">
              <CompactAudioPlayer src={sample.url} t={t} size="sm" />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-base leading-none shadow-sm transition-colors ${
                    audioVote === 1
                      ? "border-accent bg-accent text-accent-contrast hover:bg-accent-strong"
                      : "hover:border-brand-500 hover:bg-brand-50"
                  }`}
                  onClick={() => onVote?.(sample.id, 1)}
                  disabled={!canVoteOnSample || isVoting || isDeleting}
                  title={t("audio.upvote")}
                  aria-label={t("audio.upvote")}
                >
                  <span aria-hidden>{t("audio.upvoteEmoji")}</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-base leading-none shadow-sm transition-colors ${
                    audioVote === -1
                      ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
                      : "hover:border-red-500 hover:bg-red-100"
                  }`}
                  onClick={() => onVote?.(sample.id, -1)}
                  disabled={!canVoteOnSample || isVoting || isDeleting}
                  title={t("audio.downvote")}
                  aria-label={t("audio.downvote")}
                >
                  <span aria-hidden>{t("audio.downvoteEmoji")}</span>
                </Button>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                  {t("audio.score", { score: sample.score_cache })}
                </span>
                {canDelete ? (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border p-0 text-xs shadow-sm ${
                        isConfirmingDelete
                          ? "border-amber-300 bg-amber-500 text-white hover:bg-amber-600"
                          : "border-red-300 bg-red-600 text-white hover:bg-red-700"
                      }`}
                      onClick={() => {
                        if (!isConfirmingDelete) {
                          setConfirmDeleteId(sample.id);
                          return;
                        }
                        setConfirmDeleteId(null);
                        onDelete?.(sample.id);
                      }}
                      disabled={isDeleting}
                      title={isConfirmingDelete ? t("audio.deleteConfirm") : t("audio.delete")}
                      aria-label={isConfirmingDelete ? t("audio.deleteConfirm") : t("audio.delete")}
                    >
                      {isConfirmingDelete ? (
                        <span className="text-sm">❓</span>
                      ) : (
                        <span className="text-sm">❌</span>
                      )}
                    </Button>
                    {isConfirmingDelete ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                        {t("audio.deleteConfirmShort")}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span>{t("audio.uploadedAt", { date: formatRelativeOrDate(sample.created_at, locale) })}</span>
              <span>
                {t("audio.uploadedBy")}{" "}
                {uploaderUrl ? (
                  <Link className="text-brand-700 hover:underline" to={uploaderUrl}>
                    {uploaderLabel}
                  </Link>
                ) : (
                  <span className="text-slate-700">{uploaderLabel}</span>
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type AudioQueueListProps = {
  files: File[];
  locale: Locale;
  t: TranslateFn;
  onRemove?: (index: number) => void;
  onClear?: () => void;
};

export function AudioQueueList({ files, locale, t, onRemove, onClear }: AudioQueueListProps) {
  if (!files.length) {
    return <p className="text-xs text-slate-600">{t("audio.queueEmpty")}</p>;
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {files.map((file, index) => (
          <li key={`${file.name}-${index}`} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-700">{file.name}</span>
            <span className="text-[11px] text-slate-500">{formatBytes(file.size, locale)}</span>
            {onRemove ? (
              <button
                type="button"
                className="text-[11px] text-red-700 hover:underline"
                onClick={() => onRemove(index)}
              >
                {t("audio.queueRemove")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {onClear ? (
        <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={onClear}>
          {t("audio.queueClear")}
        </Button>
      ) : null}
    </div>
  );
}
