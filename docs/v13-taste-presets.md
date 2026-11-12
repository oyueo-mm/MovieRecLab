# MovieRecLab V13 — Taste preset refresh (2026-11-12)

## Scope

The original six demo presets were extended from 8 to 12 rated films each, and **코미디 · 유머** / **공포 · 오컬트** were added. In total: 8 independent demonstration profiles, with 12 ratings each. Each uses **7 liked (4–5 stars), 2 neutral (3–3.5), and 3 disliked (1.5–2.5)** films, with half-star steps; these are deliberately constructed demonstration preferences, **not** real user preferences or MovieLens user data. Existing IDs `scifi`, `action`, `animation`, `romance`, `drama`, `thriller` remain stable for compatibility. New IDs: `comedy`, `horror`.

The available examples deliberately avoid identical patterns: balanced positive/neutral/negative signals, strong focal genres, genre-diverse items, and real movies mapped to MovieLens `ml-latest-small` titles. Because the V12 theme recommendation chooses a favorite genre from rating evidence, the thriller profile was refined to emphasize actual Mystery/Thriller titles instead of being dominated by Horror.

## Behavior and verification

- The existing compact preset menu in the initial rating UI and Showcase menu reads from `demo-presets.js` automatically. No layout changes, new tracking, new sources, or new user-history storage.
- Selecting a preset **replaces** existing ratings, immediately opens recommendations, and retains manual editing. The quick-return/reset paths behave as before.
- Every rated movie title is resolved by **exact** MovieLens `ml-latest-small` title into a real film ID. The pinned CSV source is `https://raw.githubusercontent.com/smanihwr/ml-latest-small/ba3cd91761e54faa64483456b619d1a1f4d70971/movies.csv`.
- `tests/preset-rating.test.js` verifies 8 distinct presets, 12 distinct real titles each, rating scale and 7/2/3 profile composition.
- `tests/ui-dom-integration.test.js` verifies switching between onboarding, rating cancel/save and reset with the updated 12/13 rating counts.
- `tests/preset-rails-live.test.js` downloads the real pinned MovieLens Small movie/rating data and loads the already deployed **real 25M V10 trained item relationships and Tag Genome-derived features**. It verifies every preset resolves to 12 IDs, has at least 10 IDs in the matched 25M catalog, produces V10 personalized candidates, infers a related genre, and yields three independent V12 discovery rows with 12 candidates each after reserving the original three rows. Total **72 unique IDs across the six rows** in this controlled integration check, no pre-rated film, deterministic model outputs.

### Important qualifications

- **No claim of improved offline accuracy**: these are illustrative demonstration profiles, not a test-set selection policy. Their hand-picked tastes are intentionally different and may make visible recommendations appear stronger, but do not change NDCG/Recall/HitRate of actual held-out users.
- Moving from 8 to 12 ratings changes V11 from the last-tested 5-rating adaptive bin to the 10-rating bin; this is consistent with the released configuration but **does not demonstrate 12-rating superiority**.
- Strongly genre-specific presets can make a genre-recommendation theme more coherent and can reduce coverage of other genres; users should test with their own ratings too.
- The test's 3 baseline rails use real precomputed V10 candidates to stress-test deduplication and verify 6x12 capacity; actual EASE/User KNN rails use their own recommenders and may share film IDs. The V12 supplementary rails exclude previously recommended films.

## Rollback

- **Pre-V13 main:** `4a79e17615ac3e24d4ea4e75404ff94673cd1b0c`
- **Backup:** `backup/pre-v13-preset-refresh-2026-11-12`
- **Development:** `feat/v13-taste-presets-12`
- **Release rollback:** revert only this dedicated V13 PR as a standard new commit. Preserve the backup branch, maintain V12/V11 models and all Git history, no forced push.

The original MovieLens 25M raw dataset, individual training ratings, and Tag Genome raw relevance table are not distributed in this update.
