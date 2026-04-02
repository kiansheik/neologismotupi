export type EntryStatus =
  | "pending"
  | "approved"
  | "disputed"
  | "rejected"
  | "archived";
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

export interface SourceRecord {
  work_id: string;
  edition_id: string;
  authors: string | null;
  title: string | null;
  publication_year: number | null;
  edition_label: string | null;
  pages: string | null;
  urls: string[];
  citation: string;
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
  current_user_vote?: number | null;
  proposer_user_id: string;
  proposer: EntryAuthor;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface AudioSample {
  id: string;
  entry_id: string | null;
  example_id: string | null;
  user_id: string;
  uploader_display_name?: string | null;
  uploader_profile_url?: string | null;
  url: string;
  mime_type: string;
  duration_seconds: number | null;
  score_cache: number;
  upvote_count_cache: number;
  downvote_count_cache: number;
  current_user_vote?: number | null;
  created_at: string;
}

export interface AudioVoteResponse {
  audio_id: string;
  user_id: string;
  value: number;
  score_cache: number;
}

export interface EntryVersion {
  id: string;
  entry_id: string;
  edited_by_user_id: string;
  edited_by_display_name?: string | null;
  version_number: number;
  snapshot_json: Record<string, unknown>;
  edit_summary: string | null;
  created_at: string;
}

export interface EntryHistoryEvent {
  id: string;
  kind: "version" | "moderation";
  version_number: number | null;
  action_type: string | null;
  summary: string | null;
  actor_user_id: string | null;
  actor_display_name: string | null;
  created_at: string;
}

export interface Example {
  id: string;
  entry_id: string;
  user_id: string;
  sentence_original: string;
  translation_pt: string | null;
  translation_en: string | null;
  source_citation: string | null;
  source?: SourceRecord | null;
  usage_note: string | null;
  context_tag: string | null;
  status: ExampleStatus;
  score_cache: number;
  upvote_count_cache: number;
  downvote_count_cache: number;
  current_user_vote?: number | null;
  audio_samples: AudioSample[];
  moderation_reason?: string | null;
  moderation_notes?: string | null;
  moderated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExampleVersion {
  id: string;
  example_id: string;
  edited_by_user_id: string;
  version_number: number;
  snapshot_json: Record<string, unknown>;
  edit_summary: string | null;
  created_at: string;
}

export interface EntryComment {
  id: string;
  entry_id: string;
  user_id: string;
  parent_comment_id: string | null;
  body: string;
  score_cache: number;
  upvote_count_cache: number;
  downvote_count_cache: number;
  current_user_vote?: number | null;
  created_at: string;
  updated_at: string;
  author: EntryAuthor;
}

export interface EntryDetail extends EntrySummary {
  source_citation?: string | null;
  source?: SourceRecord | null;
  morphology_notes: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  moderation_reason?: string | null;
  moderation_notes?: string | null;
  moderated_at?: string | null;
  versions: EntryVersion[];
  history_events?: EntryHistoryEvent[];
  examples: Example[];
  comments: EntryComment[];
  audio_samples: AudioSample[];
}

export interface SourceSuggestion {
  work_id: string;
  edition_id: string;
  authors: string | null;
  title: string | null;
  publication_year: number | null;
  edition_label: string | null;
  citation: string;
}

export interface SourceLink {
  id: string;
  url: string;
  created_at: string;
}

export interface SourceEditionStats {
  edition_id: string;
  publication_year: number | null;
  edition_label: string | null;
  entry_count: number;
  example_count: number;
  links: SourceLink[];
}

export interface SourceEntryRef {
  id: string;
  slug: string;
  headword: string;
  gloss_pt: string | null;
  part_of_speech: string | null;
  short_definition: string;
  status: EntryStatus;
  score_cache: number;
  example_count_cache: number;
  proposer_user_id: string;
  proposer_display_name: string | null;
  created_at: string;
}

export interface SourceExampleRef {
  id: string;
  entry_id: string;
  entry_slug: string;
  entry_headword: string;
  sentence_original: string;
  status: ExampleStatus;
  created_at: string;
}

export interface SourceDetail {
  work_id: string;
  authors: string | null;
  title: string | null;
  editions: SourceEditionStats[];
  entries_count: number;
  examples_count: number;
  entries: SourceEntryRef[];
  examples: SourceExampleRef[];
}

export interface EntryListResponse {
  items: EntrySummary[];
  page: number;
  page_size: number;
  total: number;
}

export interface EntryConstraints {
  entry_vote_cost: number;
  downvote_requires_comment: boolean;
  downvote_comment_min_length: number;
}

export interface EntrySubmissionGate {
  window_start: string;
  window_end: string;
  votes_today: number;
  entries_today: number;
  unlocked_posts: number | null;
  remaining_posts: number | null;
  unlimited: boolean;
  next_votes_required: number;
  votes_required_for_unlimited: number;
  step1_votes: number;
  step1_posts: number;
  step2_votes: number;
  step2_posts: number;
  step3_votes: number;
}

export interface Profile {
  id: string;
  display_name: string;
  bio: string | null;
  affiliation_label: string | null;
  role_label: string | null;
  website_url?: string | null;
  instagram_handle?: string | null;
  tiktok_handle?: string | null;
  youtube_handle?: string | null;
  bluesky_handle?: string | null;
  reputation_score: number;
  badges?: UserBadgeKind[];
  stats?: PublicProfileStats;
  created_at: string;
  updated_at: string;
}

export interface PublicProfileStats {
  total_entries: number;
  entry_vote_cost_entries: number;
  total_entry_votes: number;
  entry_vote_cost_votes: number;
  total_comments: number;
  total_audio: number;
  last_seen_at: string | null;
  last_active_at: string | null;
  submitting_since_at: string | null;
}

export interface AudioSubmission {
  id: string;
  url: string;
  mime_type: string;
  duration_seconds: number | null;
  score_cache: number;
  created_at: string;
  entry_id: string | null;
  entry_slug: string | null;
  entry_headword: string | null;
  example_id: string | null;
  example_sentence_original: string | null;
}

export interface AudioSubmissionListResponse {
  items: AudioSubmission[];
  page: number;
  page_size: number;
  total: number;
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

export interface UserPreferences {
  preferred_locale: string;
}

export interface NewsletterSubscription {
  newsletter_key: string;
  is_active: boolean;
  preferred_locale: string;
}

export interface PublicUser {
  id: string;
  created_at: string;
  profile: Profile;
}

export interface MentionUser {
  id: string;
  display_name: string;
  mention_handle: string;
  profile_url: string;
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

export interface NotificationPreferences {
  in_app_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  notify_on_entry_comments: boolean;
  notify_on_mentions: boolean;
}

export interface NotificationItem {
  id: string;
  kind: "entry_comment" | "comment_mention" | string;
  title: string;
  body: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  actor_user_id: string | null;
  actor_display_name: string | null;
  actor_profile_url: string | null;
  entry_id: string | null;
  entry_slug: string | null;
  entry_headword: string | null;
  entry_url: string | null;
  comment_id: string | null;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  page: number;
  page_size: number;
  total: number;
  unread_count: number;
}

export interface ApiErrorShape {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
