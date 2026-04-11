import { forwardRef, useMemo, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

import { Textarea } from "@/components/ui/textarea";

import { parseInlineReferenceSegments } from "../utils";

type InlineReferenceHighlightProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
};

export const InlineReferenceHighlight = forwardRef<
  HTMLTextAreaElement,
  InlineReferenceHighlightProps
>(({ value, placeholder, className, onScroll, ...props }, ref) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const segments = useMemo(() => parseInlineReferenceSegments(value ?? ""), [value]);

  return (
    <div className="relative">
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-md bg-surface-input px-3 py-2 text-sm text-ink"
        aria-hidden
      >
        <div className="whitespace-pre-wrap break-words">
          {value ? (
            segments.map((segment, index) => {
              if (segment.type === "text") {
                return <span key={`text-${index}`}>{segment.value}</span>;
              }
              return (
                <span
                  key={`token-${index}`}
                  className="rounded-sm bg-brand-50/70 px-1 text-brand-700"
                >
                  {segment.value.label}
                </span>
              );
            })
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>
      </div>
      <Textarea
        ref={ref}
        className={`relative z-10 bg-transparent text-transparent caret-ink ${className ?? ""}`}
        value={value}
        placeholder={placeholder}
        onScroll={(event) => {
          if (overlayRef.current) {
            overlayRef.current.scrollTop = event.currentTarget.scrollTop;
          }
          onScroll?.(event);
        }}
        {...props}
      />
    </div>
  );
});

InlineReferenceHighlight.displayName = "InlineReferenceHighlight";
