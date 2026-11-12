# MovieRecLab Showcase V2 — independent, reversible

## V5: real multi-row Netflix-style recommendation explorer (2026-11-12)

- The initial movie-rating experience remains the original full-screen poster showcase with search, half-star ratings, per-movie undo and the existing sample presets.
- After rating at least 3 movies, clicking 추천 보기 opens the real full-screen featured recommendation, followed by a **vertically scrollable page with 3 horizontally scrollable poster rows**:
  1. 당신을 위한 추천: the user's actively selected recommendation model, default EASE.
  2. 비슷한 사용자가 좋아한 영화: original User KNN model only; any popularity-fallback items are excluded, so it never falsely labels popularity as neighbor-based recommendations. The UI warns about low evidence when fewer than 5 movies are rated.
  3. 좋아한 영화와 비슷한 영화: original Content-based similarity model, powered by genres/tags.
- Within each row films are ordered in the **actual model recommendation rank**, descending left to right; the algorithms' scores are *not* compared across rows. Movies may legitimately appear in multiple rows. Rated titles are excluded by the underlying engine.
- Clicking a row poster opens the chosen film's actual detail panel and that row's specific recommendation explanation. The separate 크게 보기 action promotes the selected film to the full-width hero. It does not abruptly scroll to the top on poster click.
- The rating screen remains a single-screen poster carousel. The right-side hero poster rail is hidden **only** in results to avoid duplicating the three recommendation rows. Up/down native scrolling moves between the hero and row sections; individual rails use horizontal scroll/touch-swipe and explicit arrow buttons. A compact model selector remains on the hero.
- Film art is always matched to each movie's real MovieLens IMDb/TMDb mapping via the existing artwork adapter, with a named fallback for unavailable posters. Missing model results remain empty, not fabricated.
- No new model is trained and the existing data, recommendation algorithms and evaluation screens are unmodified. Only showcase/ and isolated regression/docs/CI files change.
- Performance: per-profile secondary recommendations are cached in the same-origin bridge and refreshed only when the actual ratings change. Images are loaded as card rail items become visible. Repeated model switches invalidate only the featured row.
- Rollback target: branch `backup/pre-multirail-v5-2026-11-12` at commit `4f4d79c1660b2986829a7ea594fe38b86bb5fc35`. Revert only the dedicated V5 PR to remove this layout while preserving all earlier work. No force pushes or modification to the recovery branch.


## Rating and Research V4 (2026-11-12)

- Background flash fixed: artwork changes only when the selected movie ID changes. Rating and state synchronization no longer restart the same backdrop animation.
- A rated film displays a clearly labeled 평가 취소 button; clicking the identical selected rating again also removes it. The action uses the existing bridge.unrate() and keeps the minimum-three rating gate correct.
- Model comparison now renders one horizontal poster row per model instead of five-column text cards. Rankings follow the real computed algorithm order, left to right. Shared films have a small marker and each poster opens existing movie details.
- Visualization has a wider dark plot and compact tabs, with chart explanations kept accessible in disclosure. Chart axes, points, metrics and source data are unchanged.
- The algorithm guide displays all 17 advanced models immediately as concise information cards using the actual MovieRecAdvanced.descriptions source, plus all basic algorithms. None require expanding the old advanced model accordion.
- Original app engine, datasets, normal legacy entry and original cinematic experiment are unchanged; modifications are scoped to showcase and related regression tests.

### Rollback

Restore the exact pre-change tree from commit 24341499542b3cb7c19a2e25b1925a39f0c62cad, preserved on branch backup/pre-rating-and-research-fix-2026-11-12. Revert the dedicated V4 PR as a new commit on main. No force-push.

### Tests

Showcase DOM tests cover rating cancellation and background stability; the research test checks real poster IDs, rank order, accessible film detail actions, evaluation disclosures and 17 immediately visible advanced models. All earlier recommendation and visualization regressions still run.


## Research Studio redesign (2026-11-12)

- Comparison, data analysis (EDA), taste/network/performance visualization, offline evaluation, and algorithm explanations use the same **dark, minimal, cinematic visual language** as the Showcase hero. A compact horizontal tab strip sits under the research header, enabling navigation without reopening the side menu.
- The app still runs the original computation and chart logic inside its **same-origin iframe**. The only new data exposed by `bridge.js` is a read-only `comparison()` projection of existing `state.lastCompare` so that the cards can show **movie-matched poster thumbnails**. Titles/IDs and ordering come directly from the real algorithm results; missing images remain title fallbacks.
- All visual styles are scoped by `body.showcase-research` to that embedded document. The normal `/?legacy=1` experience and `/cinematic/` route receive **none** of these overrides.
- The research plot's original white SVG backing rectangles are darkened via CSS while its data, labels, point interactions and metric semantics remain unchanged. Relevant chart text, grid lines, bars, and tables have new dark contrast.
- Each algorithm guide, methodological note, and the visualization's full explanation uses native expandable `details` to keep the default layout concise **without deleting source or scientific limitations**.
- The currently selected film backdrop is used as a subdued decorative ambient image in the research area when available. It is not a data chart or a claim of causation.
- This release does **not** turn the primary recommendation results into separate model/category rows. That user-proposed design is deliberately deferred until its interaction, ranking interpretation and model separation are approved.
- Backup baseline: `683dc9f38701a6254ab67be34db37b4c7bf4a345`, permanently referenced by convention via `backup/pre-research-redesign-2026-11-12`.
- Revert the Research Studio PR to restore the original Showcase research presentation. The original film showcase, recommendation models and data are unchanged.


## V3: streaming-inspired movie browser (2026-11-12)

- Reworked the approved Showcase V2 in place. Film imagery, datasets, original recommendation engine, the independent root redirect and the /cinematic/ experiment are unchanged.
- Removed the giant selected film number, per-poster index numbers and bottom `13 / 54` and `01 / 10` counters. The film release year is shown as metadata, not repeated in the hero title.
- Main movie metadata has simple inline genre separators. Recommendation justification remains available in film details rather than permanently covering the artwork.
- Film ratings, recommendation button and model selection remain accessible; results feature a compact model shortcut that opens the original selector.
- Vertical mouse wheel **while hovering the poster rail** selects one previous or next film; trackpad deltas are accumulated, with a 400ms guard to reduce accidental skips. Horizontal gestures remain natural. Touch swipe synchronizes selection after horizontal rail scrolling.
- Larger cinematic backdrops, adjusted contrast, unobtrusive search/menu actions, white high-contrast primary buttons, modest translucent secondary actions and subtler poster borders are inspired by streaming interfaces; this is not a copy of Netflix assets/branding.
- Existing reduced motion preference, keyboard left/right navigation, rating 0.5 steps, original fallback and research routes stay supported.
- Backup of approved **official Showcase V2**: branch `backup/showcase-v2-original` at exact commit `f80226a3a3231adf0319c915c99490593fea6336`.
- To **roll back only this change**, revert its PR with a new commit on main (do not force-push). Restore V2 files/behavior from the backup. The earlier /showcase/ source tree remains available through the backup branch.


## Official landing page (2026-11-12)

The **official root URL** https://oyueo-mm.github.io/MovieRecLab/ now performs a very small same-origin client-side redirect to **/MovieRecLab/showcase/** for top-level visitors.

The legacy application remains physically intact in `index.html`:
- Direct legacy access: https://oyueo-mm.github.io/MovieRecLab/?legacy=1
- Showcase engine iframe: `../index.html` (no redirect because `window.top !== window.self`)
- Old cinematic engine iframe: `../index.html` (same guard)
- Published showcase preview: /MovieRecLab/showcase/
- Previous cinematic version: /MovieRecLab/cinematic/

There is no server rewrite; it is an immediate `location.replace()` in the head and does not add an extra back-button history step. With JavaScript disabled, the original application remains the fallback. The original recommendation engine, model training and other scripts were not changed.

**Rollback of the official route**: revert only the official-launch PR, which removes the early redirect and restores the original root page. This does NOT require reverting showcase development or deleting the /showcase/ route. The exact pre-launch tree is also preserved on `backup/pre-showcase-default-2026-11-12` (commit `301ed38325a64ae7109f79c0fb403c72e4f12882`). No force-push.


## Experience
- /showcase/ is an independent full-screen film hero with real per-film poster rail, background artwork, 0.5-step ratings, search, presets and actual recommendations.
- Recommendations, algorithms, EDA, visualizations and evaluation are connected to the original app via a same-origin iframe bridge, without copying the model. The original engine, scripts and data remain unchanged.
- The hero is a carousel design inspired by the supplied example, not a free-camera real-time 3D experience.

## Film art
- Artwork is linked by verified MovieLens IMDb / TMDb identifiers; do not show a genre photo pretending to be the correct movie.
- A small curated set of known TMDb poster/backdrop paths plus Cinemeta metadata endpoint are used. Metahub image URLs provide a backup for IMDb titles.
- Lazy loading, concurrent metadata request limit of four, and 6.5-second timeout help responsiveness. Blank artwork gets a movie-title fallback.
- Film posters and backdrops remain the property of their rights holders. TMDb credit, the required notice and an approved logo live in the Credits details. Dataset credit goes to GroupLens.
- No API key is stored. External services may not respond, may change usage policy, or may lack some images; the fallback is designed to keep the app usable.

## Safety and rollback
- Baseline commit: 96d61e33865f283cdad072302461a26b5c1b1506.
- Recovery branch: backup/pre-showcase-v2-2026-11-12.
- Experiment branch: feat/showcase-ui-v2.
- Legacy direct-access route after official launch: /MovieRecLab/?legacy=1 (the original root HTML and JS are preserved).
- Unchanged previous experiment: /MovieRecLab/cinematic/.
- New route: /MovieRecLab/showcase/.
- Immediate user fallback: open /MovieRecLab/?legacy=1. Regular root visitors go to /showcase/; iframe-based legacy rendering does not redirect.
- Deployment rollback: revert the dedicated showcase merge in a new GitHub commit/PR and verify GitHub Pages published the earlier tree. No force push or reset.
- Source bridge is injected only in the showcase iframe and never changes the source app's public API.

## Tests
Run node tests/showcase.test.js after installing jsdom@26, and the original engine and DOM test suites. GitHub Actions showcase.yml runs these on feature-branch push and PR.

Known limitations: high-resolution images require external network access; mobile visual quality and network failures need real-device verification beyond DOM tests. This is a film-poster showcase, not actual 3D rendering.
