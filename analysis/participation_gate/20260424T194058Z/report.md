# Participation Gate Calibration Report

Generated at: `2026-04-24T19:41:03.187174+00:00`  
As-of timestamp: `2026-04-24T19:40:58.001894+00:00`  
Historical submission lookback: `60` days

## Data loaded

| table_or_signal | rows |
| --- | --- |
| users | 22 |
| entries | 661 |
| entry_votes | 825 |
| examples | 133 |
| example_votes | 34 |
| comments | 261 |
| comment_votes | 86 |
| audio_samples | 61 |
| audio_votes | 7 |

## Old gate / currency-behavior signals

These tables ask whether users cluster around the old same-day thresholds of 3, 5, and 6 entry votes.

### Threshold summary

| posting_day | user_days | days_at_3_votes | days_at_5_votes | days_at_6_votes | days_at_any_old_threshold | median_entry_votes | mean_entry_votes | median_entries_submitted | pct_at_any_old_threshold |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| False | 49 | 1 | 4 | 3 | 8 | 2 | 3.551 | 0 | 0.1633 |
| True | 130 | 4 | 4 | 26 | 34 | 6 | 5.008 | 4 | 0.2615 |

### Vote-count distribution on posting vs non-posting days

| posting_day | entry_votes_bucket | user_days |
| --- | --- | --- |
| False | 0 | 8 |
| False | 1 | 14 |
| False | 2 | 9 |
| False | 3 | 1 |
| False | 4 | 5 |
| False | 5 | 4 |
| False | 6 | 3 |
| False | 7 | 1 |
| True | 0 | 26 |
| True | 1 | 10 |
| True | 2 | 8 |
| True | 3 | 4 |
| True | 4 | 6 |
| True | 5 | 4 |
| True | 6 | 26 |
| True | 7 | 20 |

## Vote timing before submissions

If votes bunch shortly before entry submission, that is evidence that users are treating votes as a prerequisite/currency rather than immediate quality judgments.

| submissions | pct_with_vote_5m_before | pct_with_vote_30m_before | pct_with_vote_2h_before | pct_with_same_day_vote_before | median_last_vote_lag_minutes |
| --- | --- | --- | --- | --- | --- |
| 661 | 0.05446 | 0.2481 | 0.4372 | 0.7564 | 74.37 |

## Candidate formula comparison

This compares current/as-of tier placement plus historical “would this actual submission have been blocked?” simulation.

| formula | users_total | users_with_score_gt_0 | users_unlimited_now | users_allowed_0_now | users_allowed_1_now | users_allowed_2_now | median_score | p90_score | high_rep_users_blocked_now | historical_submissions_evaluated | historical_submissions_blocked | historical_submission_block_rate | unique_users_with_blocked_historical_submission | approved_submission_block_rate | high_volume_low_review_users | high_volume_low_review_blocked_now |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A_simple_7d_entry_example_1x_threshold_0_3_6 | 22 | 8 | 7 | 0 | 15 | 0 | 0 | 31.5 | 0 | 611 | 78 | 0.1277 | 9 | 0.1576 | 1 | 0 |
| B_weighted_7d_entry_1_example_075_comment_1_threshold_0_3_6 | 22 | 8 | 7 | 0 | 15 | 0 | 0 | 42.5 | 0 | 611 | 78 | 0.1277 | 9 | 0.1606 | 1 | 0 |
| C_pr17_current_4d_weighted_threshold_3_5_6 | 22 | 7 | 7 | 15 | 0 | 0 | 0 | 48.5 | 1 | 611 | 76 | 0.1244 | 13 | 0.1606 | 1 | 1 |
| D_pr17_scaled_4d_weighted_threshold_0_9_18 | 22 | 7 | 5 | 0 | 16 | 1 | 0 | 48.5 | 0 | 611 | 88 | 0.144 | 9 | 0.1879 | 1 | 0 |
| E_pr17_scaled_7d_weighted_threshold_0_9_18 | 22 | 8 | 7 | 0 | 15 | 0 | 0 | 111 | 0 | 611 | 79 | 0.1293 | 9 | 0.1606 | 1 | 0 |
| F_entry_only_7d_threshold_0_3_6 | 22 | 8 | 7 | 0 | 15 | 0 | 0 | 31.5 | 0 | 611 | 79 | 0.1293 | 9 | 0.1606 | 1 | 0 |


- PR #17 default simulation currently places **7 users** in unlimited status at the as-of snapshot. Remember that with entry_vote=3 and unlimited threshold=6, two entry votes are enough for unlimited.


## Backfill preview

This estimates initial rollout score using existing historical entry/example votes only. It intentionally does not backfill page engagement.

| display_name | reputation_score | score_4d | tier_4d | score_7d | tier_7d | score_14d | tier_14d |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Juruparieté | 9 | 0 | 1_post | 54 | unlimited | 67 | unlimited |
| Kaique Gomes de Meneses | 56 | 30 | unlimited | 44 | unlimited | 59 | unlimited |
| Uyrauna | 217 | 14 | unlimited | 33 | unlimited | 100 | unlimited |
| Emerson Costa | 170 | 16 | unlimited | 18 | unlimited | 30 | unlimited |
| Ybytyruna | 143 | 5 | 2_posts | 17 | unlimited | 44 | unlimited |
| Nambiguasu | 28 | 5 | 2_posts | 14 | unlimited | 15 | unlimited |
| Kiansheik3128 | 59 | 8 | unlimited | 13 | unlimited | 28 | unlimited |
| Eirusu | 13 | 2 | 1_post | 2 | 1_post | 2 | 1_post |
| Gabriel Rolim | 14 | 0 | 1_post | 0 | 1_post | 0 | 1_post |
| cristianwcorrea | 20 | 0 | 1_post | 0 | 1_post | 0 | 1_post |
| LJaci | 0 | 0 | 1_post | 0 | 1_post | 0 | 1_post |
| Felipe Menão | 45 | 0 | 1_post | 0 | 1_post | 0 | 1_post |
| Jerffersonmanoel | 37 | 0 | 1_post | 0 | 1_post | 0 | 1_post |
| Romildo Guyraakanga | 7 | 0 | 1_post | 0 | 1_post | 0 | 1_post |
| Gustavo Fávero | 3 | 0 | 1_post | 0 | 1_post | 0 | 1_post |
| TDF | 4 | 0 | 1_post | 0 | 1_post | 0 | 1_post |
| Romildonline | 0 | 0 | 1_post | 0 | 1_post | 0 | 1_post |
| Akanguasu | 0 | 0 | 1_post | 0 | 1_post | 0 | 1_post |
| Xe'ánga Ratá | 0 | 0 | 1_post | 0 | 1_post | 0 | 1_post |
| taco_chip | 0 | 0 | 1_post | 0 | 1_post | 0 | 1_post |

_Showing 20 of 22 rows._

## Picky data-science interpretation checklist

1. If posting days cluster strongly at exactly 3/5/6 votes, the old system is producing quota behavior.
2. If many submissions have votes within 5–30 minutes beforehand, voting is being temporally coupled to posting.
3. If PR-style weights make many users unlimited after only a tiny amount of review, scale thresholds upward.
4. If a formula blocks many historically approved/high-score submissions, it is too strict.
5. If a formula does not block high-volume low-review posters, it is too weak.
6. Do not use page-engagement penalties for gate decisions until you have collected and validated them after rollout.
7. Prefer a configuration that users can understand as participation/trust, not payment.

## Output files

- `user_day_activity.csv`
- `old_gate_threshold_summary.csv`
- `old_gate_vote_distribution.csv`
- `vote_submission_lags.csv`
- `user_summary.csv`
- `formula_user_snapshot.csv`
- `formula_historical_submission_impact.csv`
- `formula_summary.csv`
- `backfill_preview.csv`
