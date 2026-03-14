export type EntryStatus = "pending" | "approved" | "disputed" | "rejected" | "archived";
export type ExampleStatus = "pending" | "approved" | "hidden" | "rejected";
export type UserBadgeKind = "founder" | "top_contributor" | "karma_leader";

export interface Tag {
  id: string;
  name: string;
  type: "domain" | "region" | "community" | "grammar";
  slug: string;
}

export interface EntryAuthor {
  id: string;
  display_name: string;
  reputation_score: number;
  badges?: UserBadgeKind[];
}

export interface EntrySummary {
  id: string;
  slug: string;
  headword: string;
  normalized_headword: string;
  gloss_pt: string | null;
  gloss_en: string | null;
  part_of_speech: string | null;
  short_definition: string;
  status: EntryStatus;
  score_cache: number;
  upvote_count_cache: number;
  downvote_count_cache: number;
  example_count_cache: number;
  proposer_user_id: string;
  proposer: EntryAuthor;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface EntryVersion {
  id: string;
  entry_id: string;
  edited_by_user_id: string;
  version_number: number;
  snapshot_json: Record<string, unknown>;
  edit_summary: string | null;
  created_at: string;
}

export interface Example {
  id: string;
  entry_id: string;
  user_id: string;
  sentence_original: string;
  translation_pt: string | null;
  translation_en: string | null;
  usage_note: string | null;
  context_tag: string | null;
  status: ExampleStatus;
  score_cache: number;
  upvote_count_cache: number;
  downvote_count_cache: number;
  moderation_reason?: string | null;
  moderation_notes?: string | null;
  moderated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryDetail extends EntrySummary {
  morphology_notes: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  moderation_reason?: string | null;
  moderation_notes?: string | null;
  moderated_at?: string | null;
  versions: EntryVersion[];
  examples: Example[];
}

export interface EntryListResponse {
  items: EntrySummary[];
  page: number;
  page_size: number;
  total: number;
}

export interface Profile {
  id: string;
  display_name: string;
  bio: string | null;
  affiliation_label: string | null;
  role_label: string | null;
  reputation_score: number;
  badges?: UserBadgeKind[];
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  is_active: boolean;
  is_verified: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at: string;
  profile: Profile | null;
}

export interface PublicUser {
  id: string;
  created_at: string;
  profile: Profile;
}

export interface DuplicateHint {
  id: string;
  slug: string;
  headword: string;
  gloss_pt: string | null;
  gloss_en: string | null;
}

export interface QueueEntry {
  id: string;
  slug: string;
  headword: string;
  status: EntryStatus;
  proposer_user_id: string;
  created_at: string;
}

export interface QueueExample {
  id: string;
  entry_id: string;
  entry_slug: string;
  entry_headword: string;
  user_id: string;
  sentence_original: string;
  status: ExampleStatus;
  created_at: string;
}

export interface ModerationQueue {
  entries: QueueEntry[];
  examples: QueueExample[];
}

export interface PeriodCount {
  today: number;
  week: number;
  month: number;
}

export interface HostDiskUsage {
  path: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  used_percent: number;
}

export interface ModerationDashboard {
  users_total: number;
  entries_total: number;
  examples_total: number;
  pending_entries_total: number;
  pending_examples_total: number;
  open_reports_total: number;
  new_users: PeriodCount;
  new_entries: PeriodCount;
  new_examples: PeriodCount;
  active_contributors: PeriodCount;
  votes: PeriodCount;
  reports: PeriodCount;
  approved_entries: PeriodCount;
  host_disk: HostDiskUsage | null;
}

export interface ModerationReport {
  id: string;
  reporter_user_id: string;
  reporter_display_name: string | null;
  reporter_profile_url: string | null;
  target_type: "entry" | "example" | "profile";
  target_id: string;
  target_label: string | null;
  target_url: string | null;
  reason_code: string;
  free_text: string | null;
  status: "open" | "reviewed" | "resolved" | "dismissed";
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
}

export interface ApiErrorShape {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
