import { useEffect, useState } from "react";

import type { InlineReferenceType } from "../utils";

export type InlineReferenceSuggestion = {
  key: string;
  label: string;
  secondary?: string;
  tokenText: string;
};

type InlineReferenceSuggestionsProps = {
  type: InlineReferenceType;
  title: string;
  isLoading: boolean;
  suggestions: InlineReferenceSuggestion[];
  selectionIndex: number;
  onSelect: (suggestion: InlineReferenceSuggestion) => void;
  onDismiss: () => void;
  emptyLabel: string;
  loadingLabel: string;
  minCharsLabel?: string;
  dismissLabel: string;
  collapseAfter?: number;
  seeMoreLabel?: string;
};

export function InlineReferenceSuggestions({
  type,
  title,
  isLoading,
  suggestions,
  selectionIndex,
  onSelect,
  onDismiss,
  emptyLabel,
  loadingLabel,
  minCharsLabel,
  dismissLabel,
  collapseAfter,
  seeMoreLabel,
}: InlineReferenceSuggestionsProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [type, suggestions.length]);

  const visibleSuggestions =
    collapseAfter && !expanded ? suggestions.slice(0, collapseAfter) : suggestions;
  const canExpand =
    Boolean(collapseAfter && suggestions.length > collapseAfter && !expanded);

  return (
    <div className="absolute left-0 z-20 mt-1 w-full max-w-[calc(100vw-2rem)] overflow-x-hidden rounded-md border border-line-strong bg-surface-input shadow-lg">
      <div className="flex items-center justify-between border-b border-line-weak px-3 py-2 text-xs font-semibold text-slate-600">
        <span>{title}</span>
        <button
          type="button"
          className="rounded-full px-2 py-0.5 text-xs text-slate-500 hover:bg-surface-hover"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          ×
        </button>
      </div>
      {isLoading ? (
        <p className="px-3 py-2 text-xs text-slate-600">{loadingLabel}</p>
      ) : visibleSuggestions.length ? (
        <ul className="max-h-52 overflow-y-auto py-1">
          {visibleSuggestions.map((suggestion, index) => (
            <li key={`${type}-${suggestion.key}`}>
              <button
                type="button"
                className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm ${
                  index === selectionIndex
                    ? "bg-surface-chip text-brand-900"
                    : "text-slate-700 hover:bg-surface-hover"
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => onSelect(suggestion)}
              >
                <span className="font-medium">{suggestion.label}</span>
                {suggestion.secondary ? (
                  <span className="truncate text-xs text-slate-500">{suggestion.secondary}</span>
                ) : null}
              </button>
            </li>
          ))}
          {canExpand ? (
            <li>
              <button
                type="button"
                className="flex w-full items-center justify-center px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-surface-hover"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setExpanded(true)}
              >
                {seeMoreLabel ?? "See more"}
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="px-3 py-2 text-xs text-slate-600">{minCharsLabel ?? emptyLabel}</p>
      )}
    </div>
  );
}
