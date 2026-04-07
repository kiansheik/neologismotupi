import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "@/lib/api";
import type { Example as EntryExample, MentionUser, SourceSuggestion } from "@/lib/types";
import { buildAbsoluteUrl, useSeo } from "@/lib/seo";
import { applyZodErrors } from "@/lib/zod-form";
import { type Locale, type TranslateFn, useI18n } from "@/i18n";
import { trackEvent } from "@/lib/analytics";
import { splitEntryDefinition } from "@/lib/entry-definition";
import { formatDate, formatDateTime, formatRelativeOrDate } from "@/i18n/formatters";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-error";
import { getCachedVote, resolveVote, setCachedVote, useVoteMemoryVersion } from "@/lib/vote-memory";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserBadge } from "@/components/user-badge";
import { useCurrentUser } from "@/features/auth/hooks";
import { AudioCapture, AudioQueueList, AudioSampleList } from "@/features/audio/components";
import { deleteAudioSample, uploadEntryAudio, uploadExampleAudio, voteAudio } from "@/features/audio/api";
import { createComment, voteComment } from "@/features/comments/api";
import { listExampleVersions, reportExample, updateExample, voteExample } from "@/features/examples/api";
import { createExample, getEntry, reportEntry, updateEntry, voteEntry } from "@/features/entries/api";
import { approveEntry, approveExample, rejectEntry, rejectExample } from "@/features/moderation/api";
import { listSources } from "@/features/sources/api";
import { listMentionUsers, resolveMentionUsers } from "@/features/users/api";

type ExampleForm = {
  sentence_original: string;
  translation_pt?: string;
  source_citation?: string;
  has_source: boolean;
  source_authors?: string;
  source_title?: string;
  source_publication_year?: string;
  source_edition_label?: string;
  source_pages?: string;
  source_url?: string;
};

type CommentForm = {
  body: string;
};

type ReportForm = {
  reason: string;
};

type EntryEditForm = {
  headword: string;
  gloss_pt: string;
  gloss_en: string;
  part_of_speech: string;
  short_definition: string;
  has_source: boolean;
  source_authors: string;
  source_title: string;
  source_publication_year: string;
  source_edition_label: string;
  source_pages: string;
  source_url: string;
  source_citation: string;
  morphology_notes: string;
  edit_summary: string;
};

const REPORT_REASON_MAX = 280;
const MENTION_TOKEN_PATTERN = /@([A-Za-z0-9._-]{2,50})/g;
const MENTION_CONTEXT_PATTERN = /(?:^|[\s(])@([A-Za-z0-9._-]{0,50})$/;

type MentionContext = {
  start: number;
  end: number;
  query: string;
};

function normalizeComparableText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.?!,:;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeOptionalField(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

type SourceFormValues = {
  has_source: boolean;
  source_authors?: string;
  source_title?: string;
  source_publication_year?: string;
  source_edition_label?: string;
  source_pages?: string;
  source_url?: string;
  source_citation?: string;
};

function normalizeSourcePayload(values: SourceFormValues): {
  source: {
    authors?: string;
    title?: string;
    publication_year?: number;
    edition_label?: string;
    pages?: string;
    url?: string;
  } | null;
  source_citation: string | null;
} {
  if (!values.has_source) {
    return { source: null, source_citation: null };
  }

  const authors = normalizeOptionalField(values.source_authors);
  const title = normalizeOptionalField(values.source_title);
  const publicationYearRaw = normalizeOptionalField(values.source_publication_year);
  const publicationYear = publicationYearRaw ? Number(publicationYearRaw) : undefined;
  const editionLabel = normalizeOptionalField(values.source_edition_label);
  const pages = normalizeOptionalField(values.source_pages);
  const sourceUrl = normalizeOptionalField(values.source_url);
  const sourceCitation = normalizeOptionalField(values.source_citation);

  if (!authors && !title) {
    return { source: null, source_citation: sourceCitation };
  }

  return {
    source: {
      authors: authors ?? undefined,
      title: title ?? undefined,
      publication_year: publicationYear,
      edition_label: editionLabel ?? undefined,
      pages: pages ?? undefined,
      url: sourceUrl ?? undefined,
    },
    source_citation: sourceCitation,
  };
}

function normalizeMentionHandle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitMentionToken(raw: string): { handle: string; trailing: string } {
  const handle = raw.replace(/[.?!,:;]+$/g, "");
  if (handle.length < 2) {
    return { handle: raw, trailing: "" };
  }
  return {
    handle,
    trailing: raw.slice(handle.length),
  };
}

function extractMentionHandles(text: string): string[] {
  const handles = new Set<string>();
  for (const match of text.matchAll(MENTION_TOKEN_PATTERN)) {
    const raw = match[1] ?? "";
    const start = match.index ?? -1;
    if (start > 0 && /[\w@]/.test(text[start - 1] ?? "")) {
      continue;
    }
    const normalized = normalizeMentionHandle(splitMentionToken(raw).handle);
    if (normalized) {
      handles.add(normalized);
    }
  }
  return [...handles];
}

function detectMentionContext(value: string, caret: number | null): MentionContext | null {
  if (caret === null || caret < 0) {
    return null;
  }
  const left = value.slice(0, caret);
  const match = left.match(MENTION_CONTEXT_PATTERN);
  if (!match) {
    return null;
  }
  const query = match[1] ?? "";
  const start = caret - query.length - 1;
  if (start < 0) {
    return null;
  }
  return { start, end: caret, query };
}

function renderCommentBody(text: string, mentionByHandle: Record<string, MentionUser>): ReactNode {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(MENTION_TOKEN_PATTERN)) {
    const raw = match[1] ?? "";
    const start = match.index ?? -1;
    if (start < 0) {
      continue;
    }
    if (start > 0 && /[\w@]/.test(text[start - 1] ?? "")) {
      continue;
    }
    const end = start + match[0].length;
    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }

    const { handle, trailing } = splitMentionToken(raw);
    const mention = mentionByHandle[normalizeMentionHandle(handle)];
    if (mention) {
      nodes.push(
        <Link
          key={`mention-${tokenIndex}-${start}`}
          to={mention.profile_url}
          className="font-medium text-brand-700 hover:underline"
        >
          @{handle}
        </Link>,
      );
      if (trailing) {
        nodes.push(trailing);
      }
    } else {
      nodes.push(match[0]);
    }

    tokenIndex += 1;
    cursor = end;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes.length ? nodes : text;
}

function historyActionLabel(actionType: string | null, t: TranslateFn): string {
  switch (actionType) {
    case "entry_approved":
      return t("entry.history.approved");
    case "entry_rejected":
      return t("entry.history.rejected");
    case "entry_disputed":
      return t("entry.history.disputed");
    case "entry_verified_by_vote":
      return t("entry.history.verifiedByVote");
    default:
      return actionType || t("entry.history.moderationAction");
  }
}

function SourceCitation({
  citation,
  workId,
  firstUrl,
  t,
}: {
  citation: string;
  workId?: string | null;
  firstUrl?: string | null;
  t: TranslateFn;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {workId ? (
        <Link className="text-brand-700 hover:underline" to={`/sources/${workId}`}>
          {citation}
        </Link>
      ) : (
        <span>{citation}</span>
      )}
      {firstUrl ? (
        <a
          href={firstUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-brand-700 hover:underline"
        >
          {t("entry.openMirror")}
        </a>
      ) : null}
    </span>
  );
}

function ExampleVersionHistory({
  exampleId,
  locale,
  t,
}: {
  exampleId: string;
  locale: Locale;
  t: TranslateFn;
}) {
  const [open, setOpen] = useState(false);
  const versionsQuery = useQuery({
    queryKey: ["example-versions", exampleId],
    queryFn: () => listExampleVersions(exampleId),
    enabled: open,
    staleTime: 60_000,
  });

  return (
    <details
      className="mt-2"
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className="cursor-pointer text-xs text-brand-700">{t("entry.showExampleVersions")}</summary>
      <div className="mt-2 rounded-md border border-brand-100 bg-brand-50/30 p-2">
        <p className="text-xs font-semibold text-brand-900">{t("entry.exampleVersionHistory")}</p>
        {versionsQuery.isLoading ? (
          <p className="mt-1 text-xs text-slate-600">{t("entry.loading")}</p>
        ) : null}
        {versionsQuery.error ? (
          <p className="mt-1 text-xs text-red-700">{t("entry.loadError")}</p>
        ) : null}
        {versionsQuery.data && versionsQuery.data.length === 0 ? (
          <p className="mt-1 text-xs text-slate-600">{t("entry.noExampleVersions")}</p>
        ) : null}
        {versionsQuery.data && versionsQuery.data.length > 0 ? (
          <ul className="mt-1 space-y-1 text-xs text-slate-700">
            {versionsQuery.data.map((version) => (
              <li key={version.id}>
                <span className="font-medium">
                  {t("entry.history.versionPrefix", { version: version.version_number })}
                </span>
                {" · "}
                {version.edit_summary || t("entry.noSummary")}
                {" · "}
                {formatDateTime(version.created_at, locale)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}

function buildEntryMetaDescription(entry: {
  headword: string;
  gloss_pt: string | null;
  short_definition: string;
  morphology_notes: string | null;
}): string {
  const parts = [
    entry.headword,
    entry.gloss_pt ?? "",
    entry.short_definition,
    entry.morphology_notes ?? "",
  ]
    .map((value) => value.trim())
    .filter(Boolean);
  const joined = parts.join(" · ");
  if (joined.length <= 180) {
    return joined;
  }
  return `${joined.slice(0, 177).trim()}...`;
}

export function EntryDetailPage() {
  const { slug } = useParams();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const { locale, t } = useI18n();
  useVoteMemoryVersion();
  const [showEntryReportForm, setShowEntryReportForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingExampleId, setEditingExampleId] = useState<string | null>(null);
  const [newExampleAudioQueue, setNewExampleAudioQueue] = useState<File[]>([]);
  const [audioVoteTargetId, setAudioVoteTargetId] = useState<string | null>(null);
  const [audioDeleteTargetId, setAudioDeleteTargetId] = useState<string | null>(null);

  const {
    data: entry,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["entry", slug],
    queryFn: () => getEntry(String(slug)),
    enabled: Boolean(slug),
  });

  const entryPageTitle = entry
    ? `${entry.headword} | ${import.meta.env.VITE_APP_NAME ?? "Dicionário de Tupi"}`
    : `${t("entry.loading")} | ${import.meta.env.VITE_APP_NAME ?? "Dicionário de Tupi"}`;
  const entryDescription = entry
    ? buildEntryMetaDescription(entry)
    : "Verbete de Tupi com histórico de revisões, exemplos e validação comunitária.";
  useSeo({
    title: entryPageTitle,
    description: entryDescription,
    canonicalPath: slug ? `/entries/${slug}` : "/",
    locale,
    ogType: "article",
    noindex: entry ? entry.status !== "approved" : false,
    structuredData: entry
      ? {
          "@context": "https://schema.org",
          "@type": "DefinedTerm",
          name: entry.headword,
          description: entry.short_definition,
          inDefinedTermSet: buildAbsoluteUrl("/"),
          termCode: entry.slug,
          url: buildAbsoluteUrl(`/entries/${entry.slug}`),
          inLanguage: "tupi",
        }
      : null,
  });

  const voteMutation = useMutation({
    mutationFn: (value: -1 | 1) => voteEntry(String(entry?.id), { value }),
    onSuccess: (_, value) => {
      setCachedVote(currentUser?.id, "entry", String(entry?.id ?? ""), value);
      trackEvent("entry_voted", { direction: value === 1 ? "up" : "down" });
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (error, value) => {
      trackEvent("entry_vote_failed", {
        direction: value === 1 ? "up" : "down",
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });

  const reportEntryMutation = useMutation({
    mutationFn: (reason: string) =>
      reportEntry(String(entry?.id), { reason_code: "other", free_text: reason }),
    onSuccess: (_, reason) => {
      trackEvent("entry_report_submitted", { reason_length: reason.trim().length });
      entryReportForm.reset();
      setShowEntryReportForm(false);
    },
    onError: (error) => {
      trackEvent("entry_report_failed", { error_code: error instanceof ApiError ? error.code : "unknown" });
    },
  });

  const reportExampleMutation = useMutation({
    mutationFn: (exampleId: string) => reportExample(exampleId, { reason_code: "incorrect" }),
    onSuccess: () => {
      trackEvent("example_report_submitted");
    },
    onError: (error) => {
      trackEvent("example_report_failed", { error_code: error instanceof ApiError ? error.code : "unknown" });
    },
  });
  const voteExampleMutation = useMutation({
    mutationFn: (params: { exampleId: string; value: -1 | 1 }) =>
      voteExample(params.exampleId, { value: params.value }),
    onSuccess: (_, params) => {
      setCachedVote(currentUser?.id, "example", params.exampleId, params.value);
      trackEvent("example_voted", { direction: params.value === 1 ? "up" : "down" });
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (error, params) => {
      trackEvent("example_vote_failed", {
        direction: params.value === 1 ? "up" : "down",
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });
  const uploadEntryAudioMutation = useMutation({
    mutationFn: (params: { entryId: string; file: File }) => uploadEntryAudio(params.entryId, params.file),
    onSuccess: () => {
      trackEvent("audio_uploaded", { target: "entry" });
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
    },
    onError: (error) => {
      trackEvent("audio_upload_failed", {
        target: "entry",
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });
  const uploadExampleAudioMutation = useMutation({
    mutationFn: (params: { exampleId: string; file: File }) => uploadExampleAudio(params.exampleId, params.file),
    onSuccess: () => {
      trackEvent("audio_uploaded", { target: "example" });
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
    },
    onError: (error) => {
      trackEvent("audio_upload_failed", {
        target: "example",
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });
  const voteAudioMutation = useMutation({
    mutationFn: (params: { audioId: string; value: -1 | 1 }) => voteAudio(params.audioId, params.value),
    onMutate: (params) => {
      setAudioVoteTargetId(params.audioId);
    },
    onSuccess: (_, params) => {
      setCachedVote(currentUser?.id, "audio", params.audioId, params.value);
      trackEvent("audio_voted", { direction: params.value === 1 ? "up" : "down" });
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
    },
    onError: (error, params) => {
      trackEvent("audio_vote_failed", {
        direction: params.value === 1 ? "up" : "down",
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
    onSettled: () => {
      setAudioVoteTargetId(null);
    },
  });
  const deleteAudioMutation = useMutation({
    mutationFn: (params: { audioId: string }) => deleteAudioSample(params.audioId),
    onMutate: (params) => {
      setAudioDeleteTargetId(params.audioId);
    },
    onSuccess: () => {
      trackEvent("audio_deleted");
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
    },
    onError: (error) => {
      trackEvent("audio_delete_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
    onSettled: () => {
      setAudioDeleteTargetId(null);
    },
  });
  const approveEntryMutation = useMutation({
    mutationFn: () => approveEntry(String(entry?.id)),
    onSuccess: () => {
      trackEvent("moderation_entry_approved");
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    },
    onError: (error) => {
      trackEvent("moderation_entry_approve_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });
  const rejectEntryMutation = useMutation({
    mutationFn: (reason: string) => rejectEntry(String(entry?.id), { reason }),
    onSuccess: () => {
      trackEvent("moderation_entry_rejected");
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    },
    onError: (error) => {
      trackEvent("moderation_entry_reject_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });
  const approveExampleMutation = useMutation({
    mutationFn: (exampleId: string) => approveExample(exampleId),
    onSuccess: () => {
      trackEvent("moderation_example_approved");
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    },
    onError: (error) => {
      trackEvent("moderation_example_approve_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });
  const rejectExampleMutation = useMutation({
    mutationFn: (params: { exampleId: string; reason: string }) =>
      rejectExample(params.exampleId, { reason: params.reason }),
    onSuccess: () => {
      trackEvent("moderation_example_rejected");
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    },
    onError: (error) => {
      trackEvent("moderation_example_reject_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });

  const exampleForm = useForm<ExampleForm>({
    defaultValues: {
      sentence_original: "",
      translation_pt: "",
      has_source: false,
      source_authors: "",
      source_title: "",
      source_publication_year: "",
      source_edition_label: "",
      source_pages: "",
      source_url: "",
      source_citation: "",
    },
  });
  const exampleEditForm = useForm<ExampleForm>({
    defaultValues: {
      sentence_original: "",
      translation_pt: "",
      has_source: false,
      source_authors: "",
      source_title: "",
      source_publication_year: "",
      source_edition_label: "",
      source_pages: "",
      source_url: "",
      source_citation: "",
    },
  });

  const entryReportForm = useForm<ReportForm>({
    defaultValues: {
      reason: "",
    },
  });

  const commentForm = useForm<CommentForm>({
    defaultValues: {
      body: "",
    },
  });

  const entryEditForm = useForm<EntryEditForm>({
    defaultValues: {
      headword: "",
      gloss_pt: "",
      gloss_en: "",
      part_of_speech: "",
      short_definition: "",
      has_source: false,
      source_authors: "",
      source_title: "",
      source_publication_year: "",
      source_edition_label: "",
      source_pages: "",
      source_url: "",
      source_citation: "",
      morphology_notes: "",
      edit_summary: "",
    },
  });
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionContext, setMentionContext] = useState<MentionContext | null>(null);
  const [mentionSelectionIndex, setMentionSelectionIndex] = useState(0);
  const commentBodyValue = commentForm.watch("body");
  const entryHasSource = entryEditForm.watch("has_source");
  const entrySourceAuthors = entryEditForm.watch("source_authors");
  const entrySourceTitle = entryEditForm.watch("source_title");
  const entrySourceLookupQuery = useMemo(
    () => [entrySourceAuthors, entrySourceTitle].map((value) => value?.trim() ?? "").join(" ").trim(),
    [entrySourceAuthors, entrySourceTitle],
  );
  const exampleHasSource = exampleForm.watch("has_source");
  const exampleSourceAuthors = exampleForm.watch("source_authors");
  const exampleSourceTitle = exampleForm.watch("source_title");
  const exampleSourceLookupQuery = useMemo(
    () => [exampleSourceAuthors, exampleSourceTitle].map((value) => value?.trim() ?? "").join(" ").trim(),
    [exampleSourceAuthors, exampleSourceTitle],
  );
  const exampleEditHasSource = exampleEditForm.watch("has_source");
  const exampleEditSourceAuthors = exampleEditForm.watch("source_authors");
  const exampleEditSourceTitle = exampleEditForm.watch("source_title");
  const exampleEditSourceLookupQuery = useMemo(
    () =>
      [exampleEditSourceAuthors, exampleEditSourceTitle].map((value) => value?.trim() ?? "").join(" ").trim(),
    [exampleEditSourceAuthors, exampleEditSourceTitle],
  );
  const addNewExampleAudio = (file: File) => {
    setNewExampleAudioQueue((current) => [...current, file]);
  };
  const removeNewExampleAudio = (index: number) => {
    setNewExampleAudioQueue((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };
  const clearNewExampleAudio = () => {
    setNewExampleAudioQueue([]);
  };
  const canWrite = Boolean(currentUser);
  const isModerator = Boolean(currentUser?.is_superuser);
  const canEditEntry = Boolean(
    currentUser && entry && (isModerator || currentUser.id === entry.proposer_user_id),
  );

  const entrySourceSuggestionsQuery = useQuery({
    queryKey: ["entry-source-suggestions", entrySourceLookupQuery],
    queryFn: () => listSources({ query: entrySourceLookupQuery, limit: 8 }),
    enabled: canEditEntry && showEditForm && entryHasSource && entrySourceLookupQuery.length >= 2,
    staleTime: 30_000,
  });

  const exampleSourceSuggestionsQuery = useQuery({
    queryKey: ["example-source-suggestions", exampleSourceLookupQuery],
    queryFn: () => listSources({ query: exampleSourceLookupQuery, limit: 8 }),
    enabled: canWrite && exampleHasSource && exampleSourceLookupQuery.length >= 2,
    staleTime: 30_000,
  });

  const exampleEditSourceSuggestionsQuery = useQuery({
    queryKey: ["example-edit-source-suggestions", editingExampleId, exampleEditSourceLookupQuery],
    queryFn: () => listSources({ query: exampleEditSourceLookupQuery, limit: 8 }),
    enabled: canWrite && Boolean(editingExampleId) && exampleEditHasSource && exampleEditSourceLookupQuery.length >= 2,
    staleTime: 30_000,
  });

  const commentMentionHandles = useMemo(() => {
    if (!entry?.comments?.length) {
      return [];
    }
    const handles = new Set<string>();
    for (const comment of entry.comments) {
      for (const handle of extractMentionHandles(comment.body)) {
        handles.add(handle);
      }
    }
    return [...handles];
  }, [entry?.comments]);

  const resolvedMentionsQuery = useQuery({
    queryKey: ["mentions", "resolve", commentMentionHandles],
    queryFn: () => resolveMentionUsers(commentMentionHandles),
    enabled: commentMentionHandles.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const mentionByHandle = useMemo(() => {
    const out: Record<string, MentionUser> = {};
    for (const mention of resolvedMentionsQuery.data ?? []) {
      const key = normalizeMentionHandle(mention.mention_handle);
      if (!key) {
        continue;
      }
      out[key] = mention;
    }
    return out;
  }, [resolvedMentionsQuery.data]);

  const mentionSuggestionsQuery = useQuery({
    queryKey: ["mentions", "search", mentionContext?.query ?? ""],
    queryFn: () => listMentionUsers(mentionContext?.query ?? ""),
    enabled: canWrite && mentionContext !== null,
    staleTime: 30 * 1000,
  });

  const mentionSuggestions = mentionSuggestionsQuery.data ?? [];

  useEffect(() => {
    if (!entry) {
      return;
    }
    entryEditForm.reset({
      headword: entry.headword ?? "",
      gloss_pt: entry.gloss_pt ?? "",
      gloss_en: entry.gloss_en ?? "",
      part_of_speech: entry.part_of_speech ?? "",
      short_definition: entry.short_definition ?? "",
      has_source: Boolean(entry.source || entry.source_citation),
      source_authors: entry.source?.authors ?? "",
      source_title: entry.source?.title ?? "",
      source_publication_year:
        entry.source?.publication_year !== null && entry.source?.publication_year !== undefined
          ? String(entry.source.publication_year)
          : "",
      source_edition_label: entry.source?.edition_label ?? "",
      source_pages: entry.source?.pages ?? "",
      source_url: entry.source?.urls?.[0] ?? "",
      source_citation: entry.source_citation ?? "",
      morphology_notes: entry.morphology_notes ?? "",
      edit_summary: "",
    });
  }, [entry, entryEditForm]);

  useEffect(() => {
    setMentionSelectionIndex(0);
  }, [mentionContext?.query]);

  useEffect(() => {
    if (mentionSelectionIndex < mentionSuggestions.length) {
      return;
    }
    setMentionSelectionIndex(0);
  }, [mentionSelectionIndex, mentionSuggestions.length]);

  const createExampleMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createExample>[1]) => createExample(String(entry?.id), payload),
    onSuccess: (_, payload) => {
      trackEvent("example_submitted", {
        has_translation_pt: Boolean(payload.translation_pt?.trim()),
        has_source: Boolean(payload.source || payload.source_citation),
      });
      exampleForm.reset();
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
    },
    onError: (error) => {
      trackEvent("example_submit_failed", { error_code: error instanceof ApiError ? error.code : "unknown" });
    },
  });

  const updateExampleMutation = useMutation({
    mutationFn: (params: { exampleId: string; payload: Parameters<typeof updateExample>[1] }) =>
      updateExample(params.exampleId, params.payload),
    onSuccess: (_, params) => {
      trackEvent("example_edited", { example_id: params.exampleId });
      setEditingExampleId(null);
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    },
    onError: (error) => {
      trackEvent("example_edit_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: (payload: CommentForm) => createComment(String(entry?.id), payload),
    onSuccess: () => {
      trackEvent("comment_submitted");
      commentForm.reset();
      setMentionContext(null);
      setMentionSelectionIndex(0);
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      trackEvent("comment_submit_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });

  const voteCommentMutation = useMutation({
    mutationFn: (params: { commentId: string; value: -1 | 1 }) =>
      voteComment(params.commentId, { value: params.value }),
    onSuccess: (_, params) => {
      setCachedVote(currentUser?.id, "comment", params.commentId, params.value);
      trackEvent("comment_voted", { direction: params.value === 1 ? "up" : "down" });
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
    onError: (error, params) => {
      trackEvent("comment_vote_failed", {
        direction: params.value === 1 ? "up" : "down",
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateEntry>[1]) => updateEntry(String(entry?.id), payload),
    onSuccess: () => {
      trackEvent("entry_edited");
      entryEditForm.resetField("edit_summary");
      setShowEditForm(false);
      queryClient.invalidateQueries({ queryKey: ["entry", slug] });
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      queryClient.invalidateQueries({ queryKey: ["mod-queue"] });
    },
    onError: (error) => {
      trackEvent("entry_edit_failed", {
        error_code: error instanceof ApiError ? error.code : "unknown",
      });
    },
  });

  const onExampleSubmit = exampleForm.handleSubmit(async (payload) => {
    exampleForm.clearErrors();
    const exampleSchema = z
      .object({
        sentence_original: z.string().trim().min(3, t("entry.error.sentenceMin")),
        translation_pt: z.string().optional(),
        has_source: z.boolean().default(false),
        source_authors: z.string().trim().max(255).optional(),
        source_title: z.string().trim().max(400).optional(),
        source_publication_year: z.string().trim().optional(),
        source_edition_label: z.string().trim().max(120).optional(),
        source_pages: z.string().trim().max(120).optional(),
        source_url: z.string().trim().max(2048).optional(),
        source_citation: z.string().trim().max(500).optional(),
      })
      .superRefine((values, ctx) => {
        if (!values.has_source) {
          return;
        }
        if (!values.source_authors && !values.source_title && !values.source_citation) {
          ctx.addIssue({
            path: ["source_title"],
            code: "custom",
            message: t("submit.error.sourceNeedAuthorTitleOrCitation"),
          });
        }
        if (values.source_url && !values.source_authors && !values.source_title) {
          ctx.addIssue({
            path: ["source_url"],
            code: "custom",
            message: t("submit.error.sourceNeedAuthorOrTitle"),
          });
        }
        if (!values.source_publication_year) {
          return;
        }
        const parsedYear = Number(values.source_publication_year);
        const isValidYear = Number.isInteger(parsedYear) && parsedYear >= 1 && parsedYear <= 3000;
        if (!isValidYear) {
          ctx.addIssue({
            path: ["source_publication_year"],
            code: "custom",
            message: t("submit.error.sourceInvalidYear"),
          });
        }
        if (values.source_url && !/^https?:\/\//i.test(values.source_url)) {
          ctx.addIssue({
            path: ["source_url"],
            code: "custom",
            message: t("submit.error.sourceInvalidUrl"),
          });
        }
      });
    const parsed = exampleSchema.safeParse(payload);
    if (!parsed.success) {
      applyZodErrors(parsed.error, exampleForm.setError);
      return;
    }
    const normalizedSource = normalizeSourcePayload(parsed.data);
    let createdExample;
    try {
      createdExample = await createExampleMutation.mutateAsync({
        sentence_original: parsed.data.sentence_original.trim(),
        translation_pt: normalizeOptionalField(parsed.data.translation_pt) ?? undefined,
        source_citation: normalizedSource.source_citation ?? undefined,
        source: normalizedSource.source ?? undefined,
      });
    } catch {
      return;
    }
    if (createdExample && newExampleAudioQueue.length > 0) {
      for (const file of newExampleAudioQueue) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await uploadExampleAudioMutation.mutateAsync({ exampleId: createdExample.id, file });
        } catch {
          // Best-effort upload; the user can retry from the example card.
        }
      }
      setNewExampleAudioQueue([]);
    }
  });

  const onExampleEditSubmit = exampleEditForm.handleSubmit((payload) => {
    if (!editingExampleId) {
      return;
    }
    exampleEditForm.clearErrors();
    const exampleSchema = z
      .object({
        sentence_original: z.string().trim().min(3, t("entry.error.sentenceMin")),
        translation_pt: z.string().optional(),
        has_source: z.boolean().default(false),
        source_authors: z.string().trim().max(255).optional(),
        source_title: z.string().trim().max(400).optional(),
        source_publication_year: z.string().trim().optional(),
        source_edition_label: z.string().trim().max(120).optional(),
        source_pages: z.string().trim().max(120).optional(),
        source_url: z.string().trim().max(2048).optional(),
        source_citation: z.string().trim().max(500).optional(),
      })
      .superRefine((values, ctx) => {
        if (!values.has_source) {
          return;
        }
        if (!values.source_authors && !values.source_title && !values.source_citation) {
          ctx.addIssue({
            path: ["source_title"],
            code: "custom",
            message: t("submit.error.sourceNeedAuthorTitleOrCitation"),
          });
        }
        if (values.source_url && !values.source_authors && !values.source_title) {
          ctx.addIssue({
            path: ["source_url"],
            code: "custom",
            message: t("submit.error.sourceNeedAuthorOrTitle"),
          });
        }
        if (!values.source_publication_year) {
          return;
        }
        const parsedYear = Number(values.source_publication_year);
        const isValidYear = Number.isInteger(parsedYear) && parsedYear >= 1 && parsedYear <= 3000;
        if (!isValidYear) {
          ctx.addIssue({
            path: ["source_publication_year"],
            code: "custom",
            message: t("submit.error.sourceInvalidYear"),
          });
        }
        if (values.source_url && !/^https?:\/\//i.test(values.source_url)) {
          ctx.addIssue({
            path: ["source_url"],
            code: "custom",
            message: t("submit.error.sourceInvalidUrl"),
          });
        }
      });
    const parsed = exampleSchema.safeParse(payload);
    if (!parsed.success) {
      applyZodErrors(parsed.error, exampleEditForm.setError);
      return;
    }
    const normalizedSource = normalizeSourcePayload(parsed.data);
    updateExampleMutation.mutate({
      exampleId: editingExampleId,
      payload: {
        sentence_original: parsed.data.sentence_original.trim(),
        translation_pt: normalizeOptionalField(parsed.data.translation_pt),
        source_citation: normalizedSource.source_citation,
        source: normalizedSource.source,
      },
    });
  });

  const onCommentSubmit = commentForm.handleSubmit((payload) => {
    commentForm.clearErrors();
    const commentSchema = z.object({
      body: z.string().trim().min(1, t("entry.error.commentMin")),
    });
    const parsed = commentSchema.safeParse(payload);
    if (!parsed.success) {
      applyZodErrors(parsed.error, commentForm.setError);
      return;
    }
    createCommentMutation.mutate(parsed.data);
  });

  const onEntryReportSubmit = entryReportForm.handleSubmit((payload) => {
    entryReportForm.clearErrors();
    const reportSchema = z.object({
      reason: z
        .string()
        .trim()
        .min(5, t("entry.error.reportReasonMin"))
        .max(REPORT_REASON_MAX, t("entry.error.reportReasonMax")),
    });
    const parsed = reportSchema.safeParse(payload);
    if (!parsed.success) {
      applyZodErrors(parsed.error, entryReportForm.setError);
      return;
    }
    reportEntryMutation.mutate(parsed.data.reason);
  });

  const onEntryEditSubmit = entryEditForm.handleSubmit((payload) => {
    entryEditForm.clearErrors();
    const editSchema = z
      .object({
        headword: z.string().trim().min(1, t("submit.error.headwordRequired")),
        gloss_pt: z.string().trim().min(1, t("submit.error.glossRequired")),
        gloss_en: z.string().optional(),
        part_of_speech: z.string().optional(),
        short_definition: z.string().optional(),
        has_source: z.boolean().default(false),
        source_authors: z.string().trim().max(255).optional(),
        source_title: z.string().trim().max(400).optional(),
        source_publication_year: z.string().trim().optional(),
        source_edition_label: z.string().trim().max(120).optional(),
        source_pages: z.string().trim().max(120).optional(),
        source_url: z.string().trim().max(2048).optional(),
        source_citation: z.string().trim().max(500).optional(),
        morphology_notes: z.string().optional(),
        edit_summary: z.string().trim().min(3, t("entry.error.editSummaryMin")),
      })
      .superRefine((values, ctx) => {
        if (!values.has_source) {
          return;
        }
        if (!values.source_authors && !values.source_title && !values.source_citation) {
          ctx.addIssue({
            path: ["source_title"],
            code: "custom",
            message: t("submit.error.sourceNeedAuthorTitleOrCitation"),
          });
        }
        if (values.source_url && !values.source_authors && !values.source_title) {
          ctx.addIssue({
            path: ["source_url"],
            code: "custom",
            message: t("submit.error.sourceNeedAuthorOrTitle"),
          });
        }
        if (!values.source_publication_year) {
          return;
        }
        const parsedYear = Number(values.source_publication_year);
        const isValidYear = Number.isInteger(parsedYear) && parsedYear >= 1 && parsedYear <= 3000;
        if (!isValidYear) {
          ctx.addIssue({
            path: ["source_publication_year"],
            code: "custom",
            message: t("submit.error.sourceInvalidYear"),
          });
        }
        if (values.source_url && !/^https?:\/\//i.test(values.source_url)) {
          ctx.addIssue({
            path: ["source_url"],
            code: "custom",
            message: t("submit.error.sourceInvalidUrl"),
          });
        }
      });
    const parsed = editSchema.safeParse(payload);
    if (!parsed.success) {
      applyZodErrors(parsed.error, entryEditForm.setError);
      return;
    }
    const normalizedSource = normalizeSourcePayload(parsed.data);
    updateEntryMutation.mutate({
      headword: parsed.data.headword.trim(),
      gloss_pt: parsed.data.gloss_pt.trim(),
      gloss_en: parsed.data.gloss_en,
      part_of_speech: parsed.data.part_of_speech,
      short_definition: parsed.data.short_definition,
      source: normalizedSource.source,
      source_citation: normalizedSource.source_citation,
      morphology_notes: parsed.data.morphology_notes,
      edit_summary: parsed.data.edit_summary.trim(),
    });
  });

  const updateMentionContextFromInput = (value: string, caret: number | null) => {
    setMentionContext(detectMentionContext(value, caret));
  };

  const insertMentionSuggestion = (mention: MentionUser) => {
    if (!mentionContext) {
      return;
    }
    const current = commentForm.getValues("body") ?? "";
    const insertText = `@${mention.mention_handle} `;
    const cursorAfterInsert = mentionContext.start + insertText.length;
    const nextBody =
      current.slice(0, mentionContext.start) + insertText + current.slice(mentionContext.end);
    commentForm.setValue("body", nextBody, { shouldDirty: true, shouldTouch: true });
    setMentionContext(null);
    setMentionSelectionIndex(0);
    window.requestAnimationFrame(() => {
      const textarea = commentTextareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(cursorAfterInsert, cursorAfterInsert);
    });
  };

  const onCommentTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mentionContext) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setMentionContext(null);
      return;
    }
    if (!mentionSuggestions.length) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMentionSelectionIndex((current) => (current + 1) % mentionSuggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMentionSelectionIndex((current) =>
        current === 0 ? mentionSuggestions.length - 1 : current - 1,
      );
      return;
    }
    if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault();
      insertMentionSuggestion(mentionSuggestions[mentionSelectionIndex] ?? mentionSuggestions[0]);
    }
  };
  const showMentionSuggestions = mentionContext !== null;

  const applySourceSuggestionToEntryEdit = (source: SourceSuggestion) => {
    entryEditForm.setValue("source_authors", source.authors ?? "");
    entryEditForm.setValue("source_title", source.title ?? "");
    entryEditForm.setValue(
      "source_publication_year",
      source.publication_year !== null ? String(source.publication_year) : "",
    );
    entryEditForm.setValue("source_edition_label", source.edition_label ?? "");
    entryEditForm.setValue("source_url", "");
  };

  const applySourceSuggestionToExampleCreate = (source: SourceSuggestion) => {
    exampleForm.setValue("source_authors", source.authors ?? "");
    exampleForm.setValue("source_title", source.title ?? "");
    exampleForm.setValue(
      "source_publication_year",
      source.publication_year !== null ? String(source.publication_year) : "",
    );
    exampleForm.setValue("source_edition_label", source.edition_label ?? "");
    exampleForm.setValue("source_url", "");
  };

  const applySourceSuggestionToExampleEdit = (source: SourceSuggestion) => {
    exampleEditForm.setValue("source_authors", source.authors ?? "");
    exampleEditForm.setValue("source_title", source.title ?? "");
    exampleEditForm.setValue(
      "source_publication_year",
      source.publication_year !== null ? String(source.publication_year) : "",
    );
    exampleEditForm.setValue("source_edition_label", source.edition_label ?? "");
    exampleEditForm.setValue("source_url", "");
  };

  const startEditingExample = (example: EntryExample) => {
    setEditingExampleId(example.id);
    updateExampleMutation.reset();
    exampleEditForm.reset({
      sentence_original: example.sentence_original ?? "",
      translation_pt: example.translation_pt ?? "",
      has_source: Boolean(example.source || example.source_citation),
      source_authors: example.source?.authors ?? "",
      source_title: example.source?.title ?? "",
      source_publication_year:
        example.source?.publication_year !== null && example.source?.publication_year !== undefined
          ? String(example.source.publication_year)
          : "",
      source_edition_label: example.source?.edition_label ?? "",
      source_pages: example.source?.pages ?? "",
      source_url: example.source?.urls?.[0] ?? "",
      source_citation: example.source_citation ?? "",
    });
  };

  const cancelEditingExample = () => {
    setEditingExampleId(null);
    updateExampleMutation.reset();
    exampleEditForm.reset({
      sentence_original: "",
      translation_pt: "",
      has_source: false,
      source_authors: "",
      source_title: "",
      source_publication_year: "",
      source_edition_label: "",
      source_pages: "",
      source_url: "",
      source_citation: "",
    });
  };

  const promptRequiredReason = (promptText: string): string | null => {
    const response = window.prompt(promptText);
    if (response === null) {
      return null;
    }
    const reason = response.trim();
    if (!reason) {
      window.alert(t("moderation.reasonRequired"));
      return null;
    }
    return reason;
  };

  if (isLoading) {
    return <p className="text-sm text-slate-700">{t("entry.loading")}</p>;
  }

  if (error || !entry) {
    return <p className="text-sm text-red-700">{t("entry.loadError")}</p>;
  }

  const preferredGloss = (() => {
    const glossPt = entry.gloss_pt?.trim() ?? "";
    const glossEn = entry.gloss_en?.trim() ?? "";
    if (locale === "en-US") {
      return glossEn || glossPt;
    }
    return glossPt || glossEn;
  })();
  const definitionParts = splitEntryDefinition(entry.short_definition);
  const shouldShowGloss =
    Boolean(preferredGloss) &&
    normalizeComparableText(preferredGloss) !== normalizeComparableText(entry.short_definition);
  const entryVote = resolveVote(
    entry.current_user_vote,
    getCachedVote(currentUser?.id, "entry", entry.id),
  );
  const historyEvents =
    entry.history_events && entry.history_events.length > 0
      ? entry.history_events
      : entry.versions.map((version) => ({
          id: version.id,
          kind: "version" as const,
          version_number: version.version_number,
          action_type: null,
          summary: version.edit_summary,
          actor_user_id: version.edited_by_user_id,
          actor_display_name: version.edited_by_display_name ?? null,
          created_at: version.created_at,
        }));
  const canApproveEntry = entry.status !== "approved";
  const canRejectEntry = entry.status !== "rejected";
  const displayedSourceCitation = entry.source?.citation ?? entry.source_citation ?? null;
  const entrySourceWorkId = entry.source?.work_id ?? null;
  const entrySourceFirstUrl = entry.source?.urls?.[0] ?? null;

  return (
    <section className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-brand-900">{entry.headword}</h1>
          <StatusBadge status={entry.status} />
        </div>
        {shouldShowGloss ? (
          <p className="mt-2 inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-1 text-sm font-medium text-brand-900">
            <span className="font-semibold">{t("entry.glossLabel")}:</span>
            <span>{preferredGloss}</span>
          </p>
        ) : null}
        {definitionParts.length <= 1 ? (
          <p className="mt-2 text-sm text-slate-700">{entry.short_definition}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {definitionParts.map((part, index) => (
              <li key={`${index}-${part}`} className="flex gap-2">
                <span className="mt-0.5 text-brand-700">•</span>
                <span>{part}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-sm text-slate-600">
          {t("entry.submittedBy")}{" "}
          <span className="inline-flex flex-wrap items-center gap-1">
            <Link className="text-brand-700 hover:underline" to={`/profiles/${entry.proposer.id}`}>
              {entry.proposer.display_name}
            </Link>
            <UserBadge displayName={entry.proposer.display_name} badges={entry.proposer.badges} />
            <span>· {t("reputation.label", { score: entry.proposer.reputation_score })}</span>
          </span>
        </p>
        {(entry.status === "rejected" || entry.status === "disputed") &&
        (entry.moderation_reason || entry.moderation_notes) ? (
          <p className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-800">
            {t("entry.moderationReason")}: {entry.moderation_reason || entry.moderation_notes}
          </p>
        ) : null}
        {entry.morphology_notes ? (
          <p className="mt-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{t("entry.morphology")}:</span>{" "}
            {entry.morphology_notes}
          </p>
        ) : null}
        {displayedSourceCitation ? (
          <p className="mt-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{t("entry.sourceCitation")}:</span>{" "}
            <SourceCitation
              citation={displayedSourceCitation}
              workId={entrySourceWorkId}
              firstUrl={entrySourceFirstUrl}
              t={t}
            />
          </p>
        ) : null}
        {((entry.audio_samples?.length ?? 0) > 0 || canWrite) ? (
          <div className="mt-3 rounded-md border border-brand-100 bg-surface/70 p-3">
            <h2 className="text-sm font-semibold text-brand-900">{t("audio.entryTitle")}</h2>
            <p className="mt-1 text-xs text-slate-600">{t("audio.entryHelp")}</p>
            <div className="mt-2">
              <AudioSampleList
                samples={entry.audio_samples ?? []}
                locale={locale}
                t={t}
                canVote={canWrite}
                currentUserId={currentUser?.id}
                isModerator={isModerator}
                onVote={(audioId, value) => voteAudioMutation.mutate({ audioId, value })}
                onDelete={(audioId) => deleteAudioMutation.mutate({ audioId })}
                votingAudioId={audioVoteTargetId}
                deletingAudioId={audioDeleteTargetId}
              />
            </div>
            {canWrite ? (
              <div className="mt-3">
              <AudioCapture
                t={t}
                locale={locale}
                onCapture={(file) => uploadEntryAudioMutation.mutateAsync({ entryId: entry.id, file })}
                disabled={uploadEntryAudioMutation.isPending}
              />
              </div>
            ) : (
              <p className="mt-2 text-xs text-amber-800">{t("audio.signInPrompt")}</p>
            )}
          </div>
        ) : null}
        <p className="mt-3 text-xs text-slate-500">
          {t("entry.firstRegistered", { date: formatDate(entry.created_at, locale) })}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-lg leading-none shadow-sm transition-colors ${
              entryVote === 1
                ? "border-vote-up-border bg-vote-up text-vote-up-text"
                : "hover:border-brand-500 hover:bg-brand-50"
            }`}
            onClick={() => voteMutation.mutate(1)}
            disabled={!canWrite || voteMutation.isPending}
            title={t("entry.upvote")}
            aria-label={t("entry.upvote")}
            aria-pressed={entryVote === 1}
          >
            <span aria-hidden>{t("entry.upvoteEmoji")}</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-lg leading-none shadow-sm transition-colors ${
              entryVote === -1
                ? "border-vote-down-border bg-vote-down text-vote-down-text"
                : "hover:border-red-500 hover:bg-red-100"
            }`}
            onClick={() => voteMutation.mutate(-1)}
            disabled={!canWrite || voteMutation.isPending}
            title={t("entry.downvote")}
            aria-label={t("entry.downvote")}
            aria-pressed={entryVote === -1}
          >
            <span aria-hidden>{t("entry.downvoteEmoji")}</span>
          </Button>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {t("entry.score", { score: entry.score_cache })}
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={!canWrite || reportEntryMutation.isPending}
            onClick={() => {
              setShowEntryReportForm((current) => !current);
              trackEvent("entry_report_form_toggled");
            }}
          >
            {t("entry.reportEntry")}
          </Button>
        </div>

        {canWrite && showEntryReportForm ? (
          <form
            className="mt-3 space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3"
            onSubmit={(event) => {
              void onEntryReportSubmit(event).catch(() => undefined);
            }}
          >
            <p className="text-xs text-slate-600">{t("form.requiredLegend")}</p>
            <label className="block text-sm font-medium text-slate-800" htmlFor="entry_report_reason">
              {t("entry.reportReason")} *
            </label>
            <Textarea
              id="entry_report_reason"
              rows={3}
              maxLength={REPORT_REASON_MAX}
              placeholder={t("entry.reportReasonPlaceholder")}
              {...entryReportForm.register("reason")}
            />
            <p className="text-xs text-slate-600">
              {t("entry.reportReasonCount", {
                count: entryReportForm.watch("reason").trim().length,
                max: REPORT_REASON_MAX,
              })}
            </p>
            {entryReportForm.formState.errors.reason?.message ? (
              <p className="text-xs text-red-700">{entryReportForm.formState.errors.reason.message}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="danger" disabled={reportEntryMutation.isPending}>
                {t("entry.submitReport")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  entryReportForm.reset();
                  setShowEntryReportForm(false);
                }}
              >
                {t("entry.cancelReport")}
              </Button>
            </div>
          </form>
        ) : null}

        {!canWrite ? (
          <p className="mt-3 text-sm text-amber-800">
            {t("entry.signInPrompt")} <Link to="/login">{t("entry.goToLogin")}</Link>.
          </p>
        ) : null}

        {voteMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">{getLocalizedApiErrorMessage(voteMutation.error, t)}</p>
        ) : null}
        {reportEntryMutation.isSuccess ? (
          <p className="mt-2 text-sm text-green-700">{t("entry.reportSubmitted")}</p>
        ) : null}

        {isModerator ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-brand-100 pt-4">
            {canApproveEntry ? (
              <Button
                type="button"
                className="px-2.5 py-1 text-xs disabled:opacity-35"
                onClick={() => approveEntryMutation.mutate()}
                disabled={approveEntryMutation.isPending}
              >
                {approveEntryMutation.isPending ? t("moderation.approving") : t("entry.approve")}
              </Button>
            ) : null}
            {canRejectEntry ? (
              <Button
                type="button"
                variant="danger"
                className="px-2.5 py-1 text-xs disabled:opacity-35"
                onClick={() => {
                  const reason = promptRequiredReason(t("moderation.prompt.entryRejectReason"));
                  if (!reason) {
                    return;
                  }
                  rejectEntryMutation.mutate(reason);
                }}
                disabled={rejectEntryMutation.isPending}
              >
                {rejectEntryMutation.isPending ? t("moderation.rejecting") : t("entry.reject")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {canEditEntry ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="px-2.5 py-1 text-xs"
              onClick={() => {
                setShowEditForm((current) => !current);
                trackEvent("entry_edit_toggled");
              }}
            >
              {t("entry.editButton")}
            </Button>
          </div>
        ) : null}

        {canEditEntry && showEditForm ? (
          <form
            className="mt-3 space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3"
            onSubmit={(event) => {
              void onEntryEditSubmit(event).catch(() => undefined);
            }}
          >
            <h3 className="text-sm font-semibold text-brand-900">{t("entry.editTitle")}</h3>
            <p className="text-xs text-slate-600">{t("form.requiredLegend")}</p>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_headword">
                {t("submit.headword")} *
              </label>
              <Input id="edit_headword" {...entryEditForm.register("headword")} />
              {entryEditForm.formState.errors.headword?.message ? (
                <p className="mt-1 text-xs text-red-700">{entryEditForm.formState.errors.headword.message}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_gloss_pt">
                {t("submit.glossPt")} *
              </label>
              <Input id="edit_gloss_pt" {...entryEditForm.register("gloss_pt")} />
              {entryEditForm.formState.errors.gloss_pt?.message ? (
                <p className="mt-1 text-xs text-red-700">{entryEditForm.formState.errors.gloss_pt.message}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_gloss_en">
                {t("entry.editGlossEn")} ({t("form.optional")})
              </label>
              <Input id="edit_gloss_en" {...entryEditForm.register("gloss_en")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_part_of_speech">
                {t("submit.partOfSpeech")} ({t("form.optional")})
              </label>
              <select
                id="edit_part_of_speech"
                className="w-full rounded-md border border-brand-300 bg-surface-soft px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                {...entryEditForm.register("part_of_speech")}
              >
                <option value="">{t("partOfSpeech.any")}</option>
                <option value="noun">{t("partOfSpeech.noun")}</option>
                <option value="verb_tr">{t("partOfSpeech.verb_tr")}</option>
                <option value="verb_intr">{t("partOfSpeech.verb_intr")}</option>
                <option value="verb_intr_stative">{t("partOfSpeech.verb_intr_stative")}</option>
                <option value="adjective">{t("partOfSpeech.adjective")}</option>
                <option value="adverb">{t("partOfSpeech.adverb")}</option>
                <option value="expression">{t("partOfSpeech.expression")}</option>
                <option value="pronoun">{t("partOfSpeech.pronoun")}</option>
                <option value="particle">{t("partOfSpeech.particle")}</option>
                <option value="postposition">{t("partOfSpeech.postposition")}</option>
                <option value="conjunction">{t("partOfSpeech.conjunction")}</option>
                <option value="interjection">{t("partOfSpeech.interjection")}</option>
                <option value="demonstrative">{t("partOfSpeech.demonstrative")}</option>
                <option value="number">{t("partOfSpeech.number")}</option>
                <option value="proper_noun">{t("partOfSpeech.proper_noun")}</option>
                <option value="copula">{t("partOfSpeech.copula")}</option>
                <option value="other">{t("partOfSpeech.other")}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_short_definition">
                {t("submit.definition")} ({t("form.optional")})
              </label>
              <Textarea id="edit_short_definition" {...entryEditForm.register("short_definition")} />
            </div>
            <div className="rounded-md border border-brand-100 bg-brand-50/30 p-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-900">
                <input type="checkbox" {...entryEditForm.register("has_source")} />
                {t("submit.sourceToggle")}
              </label>
              <p className="mt-1 text-xs text-slate-600">{t("submit.help.sourceCitation")}</p>
              {entryHasSource ? (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor="edit_source_authors">
                        {t("submit.sourceAuthors")} ({t("form.optional")})
                      </label>
                      <Input id="edit_source_authors" {...entryEditForm.register("source_authors")} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor="edit_source_title">
                        {t("submit.sourceTitle")} ({t("form.optional")})
                      </label>
                      <Input id="edit_source_title" {...entryEditForm.register("source_title")} />
                      {entryEditForm.formState.errors.source_title?.message ? (
                        <p className="mt-1 text-xs text-red-700">
                          {entryEditForm.formState.errors.source_title.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor="edit_source_publication_year">
                        {t("submit.sourceYear")} ({t("form.optional")})
                      </label>
                      <Input
                        id="edit_source_publication_year"
                        inputMode="numeric"
                        placeholder="2024"
                        {...entryEditForm.register("source_publication_year")}
                      />
                      {entryEditForm.formState.errors.source_publication_year?.message ? (
                        <p className="mt-1 text-xs text-red-700">
                          {entryEditForm.formState.errors.source_publication_year.message}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor="edit_source_edition_label">
                        {t("submit.sourceEdition")} ({t("form.optional")})
                      </label>
                      <Input
                        id="edit_source_edition_label"
                        {...entryEditForm.register("source_edition_label")}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor="edit_source_pages">
                        {t("submit.sourcePages")} ({t("form.optional")})
                      </label>
                      <Input id="edit_source_pages" placeholder="22-24" {...entryEditForm.register("source_pages")} />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium" htmlFor="edit_source_url">
                      {t("submit.sourceUrl")} ({t("form.optional")})
                    </label>
                    <Input id="edit_source_url" placeholder="https://..." {...entryEditForm.register("source_url")} />
                    {entryEditForm.formState.errors.source_url?.message ? (
                      <p className="mt-1 text-xs text-red-700">{entryEditForm.formState.errors.source_url.message}</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium" htmlFor="edit_source_citation">
                      {t("entry.sourceIfApplicableOptional", { optional: t("form.optional") })}
                    </label>
                    <Input id="edit_source_citation" {...entryEditForm.register("source_citation")} />
                  </div>
                  {entrySourceSuggestionsQuery.data && entrySourceSuggestionsQuery.data.length > 0 ? (
                    <div className="rounded-md border border-brand-200 bg-surface-soft p-2">
                      <p className="text-xs font-semibold text-brand-900">{t("submit.sourceSuggestionsTitle")}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entrySourceSuggestionsQuery.data.map((source) => (
                          <button
                            key={`${source.work_id}-${source.edition_id}`}
                            type="button"
                            className="rounded-full border border-brand-200 px-3 py-1 text-xs text-brand-800 hover:border-brand-500 hover:bg-brand-50"
                            onClick={() => applySourceSuggestionToEntryEdit(source)}
                          >
                            {source.citation}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_morphology_notes">
                {t("entry.morphology")} ({t("form.optional")})
              </label>
              <Textarea id="edit_morphology_notes" {...entryEditForm.register("morphology_notes")} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="edit_summary">
                {t("entry.editSummary")} *
              </label>
              <Input id="edit_summary" {...entryEditForm.register("edit_summary")} />
              <p className="mt-1 text-xs text-slate-600">{t("entry.editSummaryHelp")}</p>
              {entryEditForm.formState.errors.edit_summary?.message ? (
                <p className="mt-1 text-xs text-red-700">{entryEditForm.formState.errors.edit_summary.message}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={updateEntryMutation.isPending}>
                {t("entry.editSave")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  entryEditForm.reset({
                    headword: entry.headword ?? "",
                    gloss_pt: entry.gloss_pt ?? "",
                    gloss_en: entry.gloss_en ?? "",
                    part_of_speech: entry.part_of_speech ?? "",
                    short_definition: entry.short_definition ?? "",
                    has_source: Boolean(entry.source || entry.source_citation),
                    source_authors: entry.source?.authors ?? "",
                    source_title: entry.source?.title ?? "",
                    source_publication_year:
                      entry.source?.publication_year !== null && entry.source?.publication_year !== undefined
                        ? String(entry.source.publication_year)
                        : "",
                    source_edition_label: entry.source?.edition_label ?? "",
                    source_pages: entry.source?.pages ?? "",
                    source_url: entry.source?.urls?.[0] ?? "",
                    source_citation: entry.source_citation ?? "",
                    morphology_notes: entry.morphology_notes ?? "",
                    edit_summary: "",
                  });
                  setShowEditForm(false);
                }}
              >
                {t("entry.editCancel")}
              </Button>
            </div>
          </form>
        ) : null}

        {approveEntryMutation.isSuccess ? (
          <p className="mt-2 text-sm text-green-700">{t("entry.approvedSuccess")}</p>
        ) : null}
        {rejectEntryMutation.isSuccess ? (
          <p className="mt-2 text-sm text-green-700">{t("entry.rejectedSuccess")}</p>
        ) : null}
        {approveEntryMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(approveEntryMutation.error, t)}
          </p>
        ) : null}
        {rejectEntryMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(rejectEntryMutation.error, t)}
          </p>
        ) : null}
        {updateEntryMutation.isSuccess ? (
          <p className="mt-2 text-sm text-green-700">{t("entry.editSaved")}</p>
        ) : null}
        {updateEntryMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(updateEntryMutation.error, t)}
          </p>
        ) : null}
        {approveExampleMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(approveExampleMutation.error, t)}
          </p>
        ) : null}
        {rejectExampleMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(rejectExampleMutation.error, t)}
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("entry.usageExamples")}</h2>
        <div className="mt-3 space-y-3">
          {entry.examples.length ? (
            entry.examples.map((example) => {
              const canEditThisExample = Boolean(
                currentUser && (isModerator || currentUser.id === example.user_id),
              );
              const isEditingThisExample = editingExampleId === example.id;
              const canApproveExample = example.status !== "approved";
              const canRejectExample = example.status !== "rejected";
              const displayedExampleSourceCitation = example.source?.citation ?? example.source_citation;
              const exampleSourceWorkId = example.source?.work_id ?? null;
              const exampleSourceFirstUrl = example.source?.urls?.[0] ?? null;
              const exampleVote = resolveVote(
                example.current_user_vote,
                getCachedVote(currentUser?.id, "example", example.id),
              );

              return (
                <article key={example.id} className="rounded-md border border-brand-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-800">{example.sentence_original}</p>
                    <StatusBadge status={example.status} />
                  </div>
                  {example.translation_pt ? (
                    <p className="mt-1 text-xs text-slate-600">
                      {t("entry.translationPt")}: {example.translation_pt}
                    </p>
                  ) : null}
                  {displayedExampleSourceCitation ? (
                    <p className="mt-1 text-xs text-slate-600">
                      {t("entry.exampleSource")}:{" "}
                      <SourceCitation
                        citation={displayedExampleSourceCitation}
                        workId={exampleSourceWorkId}
                        firstUrl={exampleSourceFirstUrl}
                        t={t}
                      />
                    </p>
                  ) : null}
                  {(example.status === "rejected" || example.status === "hidden") &&
                  (example.moderation_reason || example.moderation_notes) ? (
                    <p className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
                      {t("entry.moderationReason")}: {example.moderation_reason || example.moderation_notes}
                    </p>
                  ) : null}
                  {((example.audio_samples?.length ?? 0) > 0 || canWrite) ? (
                    <div className="mt-2 rounded-md border border-brand-100 bg-surface/70 p-2">
                      <p className="text-xs font-semibold text-brand-900">{t("audio.exampleTitle")}</p>
                      <div className="mt-2">
                        <AudioSampleList
                          samples={example.audio_samples ?? []}
                          locale={locale}
                          t={t}
                          canVote={canWrite}
                          currentUserId={currentUser?.id}
                          isModerator={isModerator}
                          onVote={(audioId, value) => voteAudioMutation.mutate({ audioId, value })}
                          onDelete={(audioId) => deleteAudioMutation.mutate({ audioId })}
                          votingAudioId={audioVoteTargetId}
                          deletingAudioId={audioDeleteTargetId}
                        />
                      </div>
                      {canWrite ? (
                        <div className="mt-2">
                          <AudioCapture
                            t={t}
                            locale={locale}
                            onCapture={(file) =>
                              uploadExampleAudioMutation.mutateAsync({ exampleId: example.id, file })
                            }
                            disabled={uploadExampleAudioMutation.isPending}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-base leading-none shadow-sm transition-colors ${
                        exampleVote === 1
                          ? "border-vote-up-border bg-vote-up text-vote-up-text"
                          : "hover:border-brand-500 hover:bg-brand-50"
                      }`}
                      onClick={() => voteExampleMutation.mutate({ exampleId: example.id, value: 1 })}
                      disabled={!canWrite || voteExampleMutation.isPending}
                      title={t("entry.upvote")}
                      aria-label={t("entry.upvote")}
                      aria-pressed={exampleVote === 1}
                    >
                      <span aria-hidden>{t("entry.upvoteEmoji")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-base leading-none shadow-sm transition-colors ${
                        exampleVote === -1
                          ? "border-vote-down-border bg-vote-down text-vote-down-text"
                          : "hover:border-red-500 hover:bg-red-100"
                      }`}
                      onClick={() => voteExampleMutation.mutate({ exampleId: example.id, value: -1 })}
                      disabled={!canWrite || voteExampleMutation.isPending}
                      title={t("entry.downvote")}
                      aria-label={t("entry.downvote")}
                      aria-pressed={exampleVote === -1}
                    >
                      <span aria-hidden>{t("entry.downvoteEmoji")}</span>
                    </Button>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                      {t("entry.exampleScore", { score: example.score_cache })}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {isModerator ? (
                      <>
                        {canApproveExample ? (
                          <Button
                            type="button"
                            className="px-2.5 py-1 text-xs disabled:opacity-35"
                            onClick={() => approveExampleMutation.mutate(example.id)}
                            disabled={approveExampleMutation.isPending}
                          >
                            {approveExampleMutation.isPending
                              ? t("moderation.approving")
                              : t("moderation.approve")}
                          </Button>
                        ) : null}
                        {canRejectExample ? (
                          <Button
                            type="button"
                            variant="danger"
                            className="px-2.5 py-1 text-xs disabled:opacity-35"
                            onClick={() => {
                              const reason = promptRequiredReason(t("moderation.prompt.exampleRejectReason"));
                              if (!reason) {
                                return;
                              }
                              rejectExampleMutation.mutate({ exampleId: example.id, reason });
                            }}
                            disabled={rejectExampleMutation.isPending}
                          >
                            {rejectExampleMutation.isPending
                              ? t("moderation.rejecting")
                              : t("moderation.reject")}
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    {canEditThisExample ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-2.5 py-1 text-xs"
                        onClick={() => {
                          if (isEditingThisExample) {
                            cancelEditingExample();
                            return;
                          }
                          startEditingExample(example);
                        }}
                        disabled={updateExampleMutation.isPending && isEditingThisExample}
                      >
                        {isEditingThisExample ? t("entry.editExampleCancel") : t("entry.editExampleButton")}
                      </Button>
                    ) : null}
                    {canWrite ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-2.5 py-1 text-xs"
                        onClick={() => reportExampleMutation.mutate(example.id)}
                        disabled={reportExampleMutation.isPending}
                      >
                        {t("entry.reportExample")}
                      </Button>
                    ) : null}
                  </div>
                  {isEditingThisExample ? (
                    <form
                      className="mt-3 space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-3"
                      onSubmit={(event) => {
                        void onExampleEditSubmit(event).catch(() => undefined);
                      }}
                    >
                      <h3 className="text-sm font-semibold text-brand-900">{t("entry.editExampleTitle")}</h3>
                      <p className="text-xs text-slate-600">{t("form.requiredLegend")}</p>
                      <div>
                        <label
                          className="mb-1 block text-sm font-medium"
                          htmlFor={`example_sentence_original_${example.id}`}
                        >
                          {t("entry.sentenceInTupiRequired")}
                        </label>
                        <Textarea
                          id={`example_sentence_original_${example.id}`}
                          {...exampleEditForm.register("sentence_original")}
                        />
                        {exampleEditForm.formState.errors.sentence_original?.message ? (
                          <p className="mt-1 text-xs text-red-700">
                            {exampleEditForm.formState.errors.sentence_original.message}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <label
                          className="mb-1 block text-sm font-medium"
                          htmlFor={`example_translation_pt_${example.id}`}
                        >
                          {t("entry.translationInPortugueseOptional", { optional: t("form.optional") })}
                        </label>
                        <Input
                          id={`example_translation_pt_${example.id}`}
                          {...exampleEditForm.register("translation_pt")}
                        />
                      </div>
                      <div className="rounded-md border border-brand-100 bg-brand-50/30 p-3">
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-900">
                          <input type="checkbox" {...exampleEditForm.register("has_source")} />
                          {t("submit.sourceToggle")}
                        </label>
                        <p className="mt-1 text-xs text-slate-600">{t("submit.help.sourceCitation")}</p>
                        {exampleEditHasSource ? (
                          <div className="mt-3 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label
                                  className="mb-1 block text-sm font-medium"
                                  htmlFor={`example_source_authors_${example.id}`}
                                >
                                  {t("submit.sourceAuthors")} ({t("form.optional")})
                                </label>
                                <Input
                                  id={`example_source_authors_${example.id}`}
                                  {...exampleEditForm.register("source_authors")}
                                />
                              </div>
                              <div>
                                <label
                                  className="mb-1 block text-sm font-medium"
                                  htmlFor={`example_source_title_${example.id}`}
                                >
                                  {t("submit.sourceTitle")} ({t("form.optional")})
                                </label>
                                <Input
                                  id={`example_source_title_${example.id}`}
                                  {...exampleEditForm.register("source_title")}
                                />
                                {exampleEditForm.formState.errors.source_title?.message ? (
                                  <p className="mt-1 text-xs text-red-700">
                                    {exampleEditForm.formState.errors.source_title.message}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3">
                              <div>
                                <label
                                  className="mb-1 block text-sm font-medium"
                                  htmlFor={`example_source_publication_year_${example.id}`}
                                >
                                  {t("submit.sourceYear")} ({t("form.optional")})
                                </label>
                                <Input
                                  id={`example_source_publication_year_${example.id}`}
                                  inputMode="numeric"
                                  placeholder="2024"
                                  {...exampleEditForm.register("source_publication_year")}
                                />
                                {exampleEditForm.formState.errors.source_publication_year?.message ? (
                                  <p className="mt-1 text-xs text-red-700">
                                    {exampleEditForm.formState.errors.source_publication_year.message}
                                  </p>
                                ) : null}
                              </div>
                              <div>
                                <label
                                  className="mb-1 block text-sm font-medium"
                                  htmlFor={`example_source_edition_label_${example.id}`}
                                >
                                  {t("submit.sourceEdition")} ({t("form.optional")})
                                </label>
                                <Input
                                  id={`example_source_edition_label_${example.id}`}
                                  {...exampleEditForm.register("source_edition_label")}
                                />
                              </div>
                              <div>
                                <label
                                  className="mb-1 block text-sm font-medium"
                                  htmlFor={`example_source_pages_${example.id}`}
                                >
                                  {t("submit.sourcePages")} ({t("form.optional")})
                                </label>
                                <Input
                                  id={`example_source_pages_${example.id}`}
                                  placeholder="22-24"
                                  {...exampleEditForm.register("source_pages")}
                                />
                              </div>
                            </div>
                            <div>
                              <label
                                className="mb-1 block text-sm font-medium"
                                htmlFor={`example_source_url_${example.id}`}
                              >
                                {t("submit.sourceUrl")} ({t("form.optional")})
                              </label>
                              <Input
                                id={`example_source_url_${example.id}`}
                                placeholder="https://..."
                                {...exampleEditForm.register("source_url")}
                              />
                              {exampleEditForm.formState.errors.source_url?.message ? (
                                <p className="mt-1 text-xs text-red-700">
                                  {exampleEditForm.formState.errors.source_url.message}
                                </p>
                              ) : null}
                            </div>
                            <div>
                              <label
                                className="mb-1 block text-sm font-medium"
                                htmlFor={`example_source_citation_${example.id}`}
                              >
                                {t("entry.sourceIfApplicableOptional", { optional: t("form.optional") })}
                              </label>
                              <Input
                                id={`example_source_citation_${example.id}`}
                                {...exampleEditForm.register("source_citation")}
                              />
                            </div>
                            {exampleEditSourceSuggestionsQuery.data &&
                            exampleEditSourceSuggestionsQuery.data.length > 0 ? (
                              <div className="rounded-md border border-brand-200 bg-surface-soft p-2">
                                <p className="text-xs font-semibold text-brand-900">
                                  {t("submit.sourceSuggestionsTitle")}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {exampleEditSourceSuggestionsQuery.data.map((source) => (
                                    <button
                                      key={`${source.work_id}-${source.edition_id}`}
                                      type="button"
                                      className="rounded-full border border-brand-200 px-3 py-1 text-xs text-brand-800 hover:border-brand-500 hover:bg-brand-50"
                                      onClick={() => applySourceSuggestionToExampleEdit(source)}
                                    >
                                      {source.citation}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      {updateExampleMutation.error instanceof ApiError ? (
                        <p className="text-sm text-red-700">
                          {getLocalizedApiErrorMessage(updateExampleMutation.error, t)}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" disabled={updateExampleMutation.isPending}>
                          {t("entry.editExampleSave")}
                        </Button>
                        <Button type="button" variant="secondary" onClick={cancelEditingExample}>
                          {t("entry.editExampleCancel")}
                        </Button>
                      </div>
                    </form>
                  ) : null}
                  <ExampleVersionHistory exampleId={example.id} locale={locale} t={t} />
                  {voteExampleMutation.error instanceof ApiError ? (
                    <p className="mt-2 text-xs text-red-700">
                      {getLocalizedApiErrorMessage(voteExampleMutation.error, t)}
                    </p>
                  ) : null}
                </article>
              );
            })
          ) : (
            <p className="text-sm text-slate-600">{t("entry.noExamples")}</p>
          )}
        </div>
        {updateExampleMutation.isSuccess ? (
          <p className="mt-2 text-sm text-green-700">{t("entry.editExampleSaved")}</p>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("entry.commentsTitle")}</h2>
        <div className="mt-3 space-y-3">
          {entry.comments.length ? (
            entry.comments.map((comment) => {
              const commentVote = resolveVote(
                comment.current_user_vote,
                getCachedVote(currentUser?.id, "comment", comment.id),
              );
              return (
                <article key={comment.id} className="rounded-md border border-brand-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-slate-700">
                    {t("entry.commentBy")}{" "}
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <Link className="text-brand-700 hover:underline" to={`/profiles/${comment.author.id}`}>
                        {comment.author.display_name}
                      </Link>
                      <UserBadge displayName={comment.author.display_name} badges={comment.author.badges} />
                      <span>· {t("reputation.label", { score: comment.author.reputation_score })}</span>
                    </span>
                  </p>
                  <span className="text-xs text-slate-600">{formatRelativeOrDate(comment.created_at, locale)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                  {renderCommentBody(comment.body, mentionByHandle)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-base leading-none shadow-sm transition-colors ${
                      commentVote === 1
                        ? "border-vote-up-border bg-vote-up text-vote-up-text"
                        : "hover:border-brand-500 hover:bg-brand-50"
                    }`}
                    onClick={() => voteCommentMutation.mutate({ commentId: comment.id, value: 1 })}
                    disabled={!canWrite || voteCommentMutation.isPending}
                    title={t("entry.upvote")}
                    aria-label={t("entry.upvote")}
                    aria-pressed={commentVote === 1}
                  >
                    <span aria-hidden>{t("entry.upvoteEmoji")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-input p-0 text-base leading-none shadow-sm transition-colors ${
                      commentVote === -1
                        ? "border-vote-down-border bg-vote-down text-vote-down-text"
                        : "hover:border-red-500 hover:bg-red-100"
                    }`}
                    onClick={() => voteCommentMutation.mutate({ commentId: comment.id, value: -1 })}
                    disabled={!canWrite || voteCommentMutation.isPending}
                    title={t("entry.downvote")}
                    aria-label={t("entry.downvote")}
                    aria-pressed={commentVote === -1}
                  >
                    <span aria-hidden>{t("entry.downvoteEmoji")}</span>
                  </Button>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                    {t("entry.commentScore", { score: comment.score_cache })}
                  </span>
                </div>
                </article>
              );
            })
          ) : (
            <p className="text-sm text-slate-600">{t("entry.noComments")}</p>
          )}
        </div>
        {voteCommentMutation.error instanceof ApiError ? (
          <p className="mt-2 text-sm text-red-700">
            {getLocalizedApiErrorMessage(voteCommentMutation.error, t)}
          </p>
        ) : null}

        {canWrite ? (
          <form
            className="mt-4 space-y-2"
            onSubmit={(event) => {
              void onCommentSubmit(event).catch(() => undefined);
            }}
          >
            <div className="relative">
              <Textarea
                id="comment_body"
                rows={4}
                ref={commentTextareaRef}
                placeholder={t("entry.commentPlaceholder")}
                value={commentBodyValue ?? ""}
                onChange={(event) => {
                  commentForm.setValue("body", event.target.value, { shouldDirty: true, shouldTouch: true });
                  updateMentionContextFromInput(event.target.value, event.target.selectionStart);
                }}
                onClick={(event) => {
                  updateMentionContextFromInput(event.currentTarget.value, event.currentTarget.selectionStart);
                }}
                onKeyUp={(event) => {
                  updateMentionContextFromInput(event.currentTarget.value, event.currentTarget.selectionStart);
                }}
                onKeyDown={onCommentTextareaKeyDown}
                onBlur={() => {
                  window.setTimeout(() => {
                    setMentionContext(null);
                  }, 120);
                }}
              />
              {showMentionSuggestions ? (
                <div className="absolute left-0 right-0 z-20 mt-1 rounded-md border border-line-strong bg-surface-input shadow-lg">
                  {mentionSuggestionsQuery.isLoading ? (
                    <p className="px-3 py-2 text-xs text-slate-600">{t("entry.mentionLoading")}</p>
                  ) : mentionSuggestions.length ? (
                    <ul className="max-h-52 overflow-y-auto py-1">
                      {mentionSuggestions.map((mention, index) => (
                        <li key={mention.id}>
                          <button
                            type="button"
                            className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                              index === mentionSelectionIndex
                              ? "bg-surface-chip text-brand-900"
                              : "text-slate-700 hover:bg-surface-hover"
                            }`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                            }}
                            onClick={() => {
                              insertMentionSuggestion(mention);
                            }}
                          >
                            <span className="font-medium">@{mention.mention_handle}</span>
                            <span className="truncate text-xs text-slate-600">{mention.display_name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-3 py-2 text-xs text-slate-600">{t("entry.mentionNoResults")}</p>
                  )}
                </div>
              ) : null}
            </div>
            <p className="text-xs text-slate-600">{t("entry.commentHelpMention")}</p>
            {commentForm.formState.errors.body?.message ? (
              <p className="text-xs text-red-700">{commentForm.formState.errors.body.message}</p>
            ) : null}
            {createCommentMutation.error instanceof ApiError ? (
              <p className="text-sm text-red-700">
                {getLocalizedApiErrorMessage(createCommentMutation.error, t)}
              </p>
            ) : null}
            {createCommentMutation.isSuccess ? (
              <p className="text-sm text-green-700">{t("entry.commentPosted")}</p>
            ) : null}
            <Button type="submit" disabled={createCommentMutation.isPending}>
              {t("entry.postComment")}
            </Button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-amber-800">
            {t("entry.signInPrompt")} <Link to="/login">{t("entry.goToLogin")}</Link>.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-brand-900">{t("entry.versionHistory")}</h2>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-brand-700">{t("entry.showVersions")}</summary>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {historyEvents.map((event) => (
              <li key={event.id}>
                <span className="font-medium">
                  {event.kind === "version"
                    ? t("entry.history.versionPrefix", { version: event.version_number ?? "?" })
                    : historyActionLabel(event.action_type, t)}
                </span>
                {" · "}
                {event.summary || t("entry.noSummary")}
                {" · "}
                {t("entry.history.by", {
                  name: event.actor_display_name || t("entry.history.unknownActor"),
                })}
                {" · "}
                {formatDateTime(event.created_at, locale)}
              </li>
            ))}
          </ul>
        </details>
      </Card>

      {canWrite ? (
        <Card>
          <h2 className="text-lg font-semibold text-brand-900">{t("entry.addExample")}</h2>
          <p className="mt-1 text-xs text-slate-600">{t("form.requiredLegend")}</p>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              void onExampleSubmit(event).catch(() => undefined);
            }}
          >
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="sentence_original">
                {t("entry.sentenceInTupiRequired")}
              </label>
              <Textarea id="sentence_original" {...exampleForm.register("sentence_original")} />
              {exampleForm.formState.errors.sentence_original?.message ? (
                <p className="mt-1 text-xs text-red-700">
                  {exampleForm.formState.errors.sentence_original.message}
                </p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="translation_pt">
                {t("entry.translationInPortugueseOptional", { optional: t("form.optional") })}
              </label>
              <Input id="translation_pt" {...exampleForm.register("translation_pt")} />
            </div>
            <div className="rounded-md border border-brand-100 bg-brand-50/30 p-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-900">
                <input type="checkbox" {...exampleForm.register("has_source")} />
                {t("submit.sourceToggle")}
              </label>
              <p className="mt-1 text-xs text-slate-600">{t("submit.help.sourceCitation")}</p>
              {exampleHasSource ? (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor="example_source_authors">
                        {t("submit.sourceAuthors")} ({t("form.optional")})
                      </label>
                      <Input id="example_source_authors" {...exampleForm.register("source_authors")} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor="example_source_title">
                        {t("submit.sourceTitle")} ({t("form.optional")})
                      </label>
                      <Input id="example_source_title" {...exampleForm.register("source_title")} />
                      {exampleForm.formState.errors.source_title?.message ? (
                        <p className="mt-1 text-xs text-red-700">
                          {exampleForm.formState.errors.source_title.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor="example_source_publication_year">
                        {t("submit.sourceYear")} ({t("form.optional")})
                      </label>
                      <Input
                        id="example_source_publication_year"
                        inputMode="numeric"
                        placeholder="2024"
                        {...exampleForm.register("source_publication_year")}
                      />
                      {exampleForm.formState.errors.source_publication_year?.message ? (
                        <p className="mt-1 text-xs text-red-700">
                          {exampleForm.formState.errors.source_publication_year.message}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor="example_source_edition_label">
                        {t("submit.sourceEdition")} ({t("form.optional")})
                      </label>
                      <Input id="example_source_edition_label" {...exampleForm.register("source_edition_label")} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor="example_source_pages">
                        {t("submit.sourcePages")} ({t("form.optional")})
                      </label>
                      <Input id="example_source_pages" placeholder="22-24" {...exampleForm.register("source_pages")} />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium" htmlFor="example_source_url">
                      {t("submit.sourceUrl")} ({t("form.optional")})
                    </label>
                    <Input id="example_source_url" placeholder="https://..." {...exampleForm.register("source_url")} />
                    {exampleForm.formState.errors.source_url?.message ? (
                      <p className="mt-1 text-xs text-red-700">{exampleForm.formState.errors.source_url.message}</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium" htmlFor="source_citation">
                      {t("entry.sourceIfApplicableOptional", { optional: t("form.optional") })}
                    </label>
                    <Input id="source_citation" {...exampleForm.register("source_citation")} />
                  </div>
                  {exampleSourceSuggestionsQuery.data && exampleSourceSuggestionsQuery.data.length > 0 ? (
                    <div className="rounded-md border border-brand-200 bg-surface-soft p-2">
                      <p className="text-xs font-semibold text-brand-900">{t("submit.sourceSuggestionsTitle")}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {exampleSourceSuggestionsQuery.data.map((source) => (
                          <button
                            key={`${source.work_id}-${source.edition_id}`}
                            type="button"
                            className="rounded-full border border-brand-200 px-3 py-1 text-xs text-brand-800 hover:border-brand-500 hover:bg-brand-50"
                            onClick={() => applySourceSuggestionToExampleCreate(source)}
                          >
                            {source.citation}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="rounded-md border border-brand-100 bg-surface/70 p-3">
              <p className="text-sm font-semibold text-brand-900">{t("submit.audioTitle")}</p>
              <p className="mt-1 text-xs text-slate-600">{t("submit.audioHelp")}</p>
              <div className="mt-2">
                <AudioCapture
                  t={t}
                  locale={locale}
                  onCapture={addNewExampleAudio}
                  disabled={createExampleMutation.isPending}
                />
              </div>
              <div className="mt-2">
                <AudioQueueList
                  files={newExampleAudioQueue}
                  locale={locale}
                  t={t}
                  onRemove={removeNewExampleAudio}
                  onClear={clearNewExampleAudio}
                />
              </div>
            </div>
            {createExampleMutation.error instanceof ApiError ? (
              <p className="text-sm text-red-700">{getLocalizedApiErrorMessage(createExampleMutation.error, t)}</p>
            ) : null}
            {createExampleMutation.isSuccess ? (
              <p className="text-sm text-green-700">{t("entry.exampleSubmitted")}</p>
            ) : null}
            <Button type="submit" disabled={createExampleMutation.isPending}>
              {t("entry.submitExample")}
            </Button>
          </form>
        </Card>
      ) : null}
    </section>
  );
}
