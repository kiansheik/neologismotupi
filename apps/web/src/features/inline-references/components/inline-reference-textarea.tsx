import { forwardRef, useImperativeHandle, useMemo, useRef, useState, useEffect, type Ref } from "react";
import { useQuery } from "@tanstack/react-query";

import { useI18n } from "@/i18n";
import { listEntries } from "@/features/entries/api";
import { loadNavarroCache, searchNavarroCache } from "@/features/navarro/cache";
import type { EntrySummary } from "@/lib/types";

import { Textarea } from "@/components/ui/textarea";
import {
  buildNavarroLabel,
  buildNavarroToken,
  buildNeoToken,
  containsInlineReferenceTokens,
  detectInlineReferenceContext,
  extractInlineTokensToDisplay,
  applyInlineTokens,
  updateInlineTokenPositions,
  type InlineReferenceContext,
  type InlineReferenceSpan,
} from "../utils";
import {
  InlineReferenceSuggestions,
  type InlineReferenceSuggestion,
} from "./inline-reference-suggestions";

export type InlineReferenceTextareaHandle = {
  getRawValue: () => string;
};

type InlineReferenceTextareaProps = {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  onBlur?: () => void;
};

const MIN_QUERY_LENGTH = 1;

function InlineReferenceTextareaBase({
  value,
  onValueChange,
  placeholder,
  rows,
  id,
  name,
  disabled,
  className,
  onBlur,
}: InlineReferenceTextareaProps, ref: Ref<InlineReferenceTextareaHandle>) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [context, setContext] = useState<InlineReferenceContext | null>(null);
  const [selectionIndex, setSelectionIndex] = useState(0);
  const [dismissedContext, setDismissedContext] = useState<InlineReferenceContext | null>(null);
  const tokensRef = useRef<InlineReferenceSpan[]>([]);
  const lastValueRef = useRef(value);

  useImperativeHandle(
    ref,
    () => ({
      getRawValue: () => applyInlineTokens(lastValueRef.current, tokensRef.current),
    }),
    [],
  );

  const query = context?.query.trim() ?? "";
  const showSuggestions = Boolean(context);

  const navarroCacheQuery = useQuery({
    queryKey: ["navarro", "cache"],
    queryFn: loadNavarroCache,
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: context?.type === "dta",
  });

  const neoQuery = useQuery({
    queryKey: ["inline", "neo", query],
    queryFn: async () => {
      const response = await listEntries({
        page: 1,
        page_size: 6,
        search: query,
        status: "approved",
      });
      return response.items as EntrySummary[];
    },
    enabled: context?.type === "neo" && query.length >= MIN_QUERY_LENGTH,
    staleTime: 15_000,
  });

  const suggestions = useMemo<InlineReferenceSuggestion[]>(() => {
    if (!context) {
      return [];
    }
    if (context.type === "dta") {
      const results = searchNavarroCache(navarroCacheQuery.data ?? [], query, 12);
      return results.map((entry) => ({
        key: entry.id,
        label: buildNavarroLabel(entry),
        secondary: entry.definition,
        tokenText: buildNavarroToken(entry),
      }));
    }
    return (neoQuery.data ?? []).map((entry) => ({
      key: entry.id,
      label: entry.headword || entry.slug,
      secondary: entry.gloss_pt ?? undefined,
      tokenText: buildNeoToken(entry),
    }));
  }, [context, navarroCacheQuery.data, neoQuery.data, query]);

  const updateContext = (nextValue: string, caret: number | null) => {
    const nextContext = detectInlineReferenceContext(nextValue, caret);
    if (
      dismissedContext &&
      nextContext &&
      dismissedContext.start === nextContext.start &&
      dismissedContext.type === nextContext.type
    ) {
      setContext(null);
      return;
    }
    if (
      dismissedContext &&
      (!nextContext ||
        dismissedContext.start !== nextContext.start ||
        dismissedContext.type !== nextContext.type)
    ) {
      setDismissedContext(null);
    }
    setContext(nextContext);
    setSelectionIndex(0);
  };

  const insertSuggestion = (suggestion: InlineReferenceSuggestion) => {
    if (!context) {
      return;
    }
    const tokenText = `${suggestion.tokenText} `;
    const nextValue = value.slice(0, context.start) + suggestion.label + " " + value.slice(context.end);
    tokensRef.current = updateInlineTokenPositions(value, nextValue, tokensRef.current);
    tokensRef.current = [
      ...tokensRef.current,
      {
        start: context.start,
        end: context.start + suggestion.label.length,
        raw: suggestion.tokenText,
        label: suggestion.label,
      },
    ];
    onValueChange(nextValue);
    lastValueRef.current = nextValue;
    setContext(null);
    setSelectionIndex(0);
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      const cursor = context.start + tokenText.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!context) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setContext(null);
      return;
    }
    if (!suggestions.length) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectionIndex((current) => (current + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectionIndex((current) =>
        current === 0 ? suggestions.length - 1 : current - 1,
      );
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertSuggestion(suggestions[selectionIndex] ?? suggestions[0]);
    }
  };

  const title =
    context?.type === "dta"
      ? t("inlineRef.searchNavarro")
      : t("inlineRef.searchEntries");

  useEffect(() => {
    if (value === lastValueRef.current) {
      return;
    }
    if (containsInlineReferenceTokens(value)) {
      const { display, tokens } = extractInlineTokensToDisplay(value);
      tokensRef.current = tokens;
      lastValueRef.current = display;
      if (display !== value) {
        onValueChange(display);
      }
      return;
    }
    tokensRef.current = updateInlineTokenPositions(lastValueRef.current, value, tokensRef.current);
    lastValueRef.current = value;
  }, [value, onValueChange]);

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        id={id}
        name={name}
        rows={rows}
        className={className}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          tokensRef.current = updateInlineTokenPositions(value, nextValue, tokensRef.current);
          lastValueRef.current = nextValue;
          onValueChange(nextValue);
          updateContext(nextValue, event.target.selectionStart);
        }}
        onClick={(event) => {
          updateContext(event.currentTarget.value, event.currentTarget.selectionStart);
        }}
        onKeyUp={(event) => {
          updateContext(event.currentTarget.value, event.currentTarget.selectionStart);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          window.setTimeout(() => {
            setContext(null);
          }, 120);
          onBlur?.();
        }}
      />
      {showSuggestions ? (
        <InlineReferenceSuggestions
          type={context!.type}
          title={title}
          isLoading={
            context?.type === "dta" ? navarroCacheQuery.isLoading : neoQuery.isLoading
          }
          suggestions={suggestions}
          selectionIndex={selectionIndex}
          onSelect={insertSuggestion}
          onDismiss={() => {
            if (context) {
              setDismissedContext(context);
            }
            setContext(null);
          }}
          emptyLabel={t("inlineRef.empty")}
          loadingLabel={t("inlineRef.loading")}
          minCharsLabel={
            query.length < MIN_QUERY_LENGTH ? t("inlineRef.minChars") : undefined
          }
          dismissLabel={t("inlineRef.dismiss")}
          collapseAfter={5}
          seeMoreLabel={t("inlineRef.seeMore")}
          seeLessLabel={t("inlineRef.seeLess")}
        />
      ) : null}
    </div>
  );
}

export const InlineReferenceTextarea = forwardRef(InlineReferenceTextareaBase);
