import { useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/features/auth/hooks";
import {
  useAddFlashcardListItem,
  useCreateFlashcardList,
  useFlashcardLists,
  useRemoveFlashcardListItem,
} from "@/features/flashcard-lists/hooks";
import { resolveFlashcardListTitle } from "@/features/flashcard-lists/lib";
import { useI18n } from "@/i18n";

interface EntryListPickerProps {
  entryId: string;
}

export function EntryListPicker({ entryId }: EntryListPickerProps) {
  const { t, locale } = useI18n();
  const { data: currentUser } = useCurrentUser();
  const [isOpen, setIsOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  const listsQuery = useFlashcardLists(
    { owner_id: "me", entry_id: entryId, page_size: 50 },
    Boolean(currentUser) && isOpen,
  );

  const createListMutation = useCreateFlashcardList();
  const addItemMutation = useAddFlashcardListItem();
  const removeItemMutation = useRemoveFlashcardListItem();

  const listItems = listsQuery.data?.items ?? [];
  const hasAnyDeck = listItems.some((item) => item.contains_entry);
  const isBusy =
    createListMutation.isPending || addItemMutation.isPending || removeItemMutation.isPending;

  const handleToggle = (listId: string, containsEntry: boolean | null | undefined) => {
    if (containsEntry) {
      removeItemMutation.mutate({ listId, entryId });
    } else {
      addItemMutation.mutate({ listId, payload: { entry_id: entryId } });
    }
    detailsRef.current?.removeAttribute("open");
    setIsOpen(false);
  };

  const canCreate = newTitle.trim().length >= 2;

  const hasLists = listItems.length > 0;
  const title = useMemo(() => t("lists.addToDeck"), [t]);

  if (!currentUser) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted opacity-70"
        disabled
        title={t("lists.signInPrompt")}
        aria-label={t("lists.signInPrompt")}
      >
        <span className="text-[12px]" aria-hidden>
          +
        </span>
        <span>{title}</span>
      </button>
    );
  }

  return (
    <details
      ref={detailsRef}
      className="relative"
      onToggle={(event) => setIsOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none text-[11px] font-semibold text-brand-700 hover:text-brand-800 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1">
          <span className="text-[12px]" aria-hidden>
            +
          </span>
          <span>{title}</span>
          {hasAnyDeck ? (
            <span className="text-[11px] text-green-700" aria-hidden>
              ✓
            </span>
          ) : null}
        </span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-64 rounded-md border border-line-soft bg-surface p-2 shadow-lg">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {t("lists.myLists")}
        </p>
        {listsQuery.isLoading ? (
          <p className="mt-2 text-[11px] text-ink-muted">{t("lists.loading")}</p>
        ) : hasLists ? (
          <div className="mt-2 flex flex-col gap-1">
            {listItems.map((list) => {
              const label = resolveFlashcardListTitle(list, locale);
              const containsEntry = list.contains_entry;
              return (
                <button
                  key={list.id}
                  type="button"
                  className={`flex items-center justify-between rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
                    containsEntry ? "bg-brand-50 text-brand-900" : "hover:bg-surface-hover"
                  }`}
                  onClick={() => handleToggle(list.id, containsEntry)}
                  disabled={isBusy}
                >
                  <span className="line-clamp-1">{label}</span>
                  <span className="text-sm">{containsEntry ? "✓" : "+"}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-ink-muted">{t("lists.empty")}</p>
        )}
        <div className="mt-3 border-t border-line-soft pt-2">
          <p className="text-[11px] font-medium text-ink-muted">{t("lists.newDeck")}</p>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder={t("lists.createPlaceholder")}
              className="h-8 text-[11px]"
            />
            <button
              type="button"
              className="h-8 rounded-md bg-accent px-2 text-[11px] font-semibold text-accent-contrast transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canCreate || isBusy}
              onClick={() => {
                const trimmed = newTitle.trim();
                if (!trimmed) return;
                createListMutation.mutate(
                  {
                    title_pt: trimmed,
                  },
                  {
                    onSuccess: (data) => {
                      addItemMutation.mutate({ listId: data.id, payload: { entry_id: entryId } });
                      setNewTitle("");
                      detailsRef.current?.removeAttribute("open");
                      setIsOpen(false);
                    },
                  },
                );
              }}
            >
              {t("lists.createCta")}
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}
