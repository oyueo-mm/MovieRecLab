# MovieRecLab V14 — Genre-diverse hero, My Ratings, cinematic movie detail

## Scope and compatibility

V14 only updates the public `showcase/` interface and metadata already fetched by the existing image provider. **All trained MovieLens small/V9–V12 models, the original six recommendation rails, V13 eight 12-rated-film presets and existing original UI remain unchanged.** No account, server data, new ratings persistence, or genre-filter controls are added.

### First rating-screen film rail

The cinematic hero at the initial rating screen remains unchanged: cinematic background on the left, horizontally swipeable poster rail at bottom-right, single active-film rating controls. The candidate rail expands from 54 to **up to 150 distinct films**. Preserve the first four recognizable classics, insert a handpicked spread including Conjuring / Scream / Shining / Insidious / It Follows alongside comedy, animation, thriller, romance, sci-fi and other genres, then round-robin the popular titles from 13 genre buckets and fill the remainder by real `ml-latest-small` rating count. Every candidate is a real film in the existing catalog; missing curated IDs are ignored without placeholders. This is deterministic, not random or algorithmic recommendation. No genre chips or filters appear. Existing on-demand/lazy poster-loading behavior is retained and enhanced for browsers without `IntersectionObserver`.

### My Ratings (내 평가)

A new sidebar route opens a **standalone dark gallery** with actual rated movies, posters, titles, years, half-star scores and sorting by most recently *entered*, highest rating, lowest rating, or title. No additional user data is stored: the gallery is derived from the same same-origin engine/iframe profile and updates immediately after rating and unrating through the existing bridge. Selecting a movie opens the same centered cinematic movie details view with direct rating editing. Users can close the gallery and return to the previous screen and recommendation-scroll position. Empty input gets an empty state. Original standalone MovieRecLab rating onboarding remains compatible.

### Cinematic detail overlay

Replace the narrow floating-right information drawer with a **centered large movie overlay** on desktop and full-screen detail on mobile. Use the existing sanitized TMDb/Cinemeta/Metahub-backed art preview and artwork result with a posterior/poster fallback where backdrop cannot load. Headline and short movie metadata overlay the image. The main content contains just a half-star editable personal rating (and unrate), optional movie description, compact IMDb / TMDb links, and a collapsible tiny `ⓘ 추천 근거` region if an actual explanation is available. The former `크게 보기` control stays in markup only as a hidden compatibility element; it is never displayed. Underlying scroll and recommendation rows remain mounted. Backdrop click, close and Escape close the overlay; a Tab focus-cycle is provided. Description is displayed only when the **already queried** Cinemeta provider gives a string `meta.description` (capped to 1800 characters); no prose is invented, no permanent synopsis database is created, and an absent description simply leaves the section hidden.

## Verification

- `tests/v14-showcase.test.js`: real showcase DOM exercised with 230 catalog fixtures, verifies 150 diverse films, horror in early lineup, sidebar route, rated gallery, rating and unrating in detail, conditional movie summary and close/keyboard dismissal.
- Existing original EASE, User KNN, 25M model, V10/V11/V12, poster, theme, search, legacy, and V13 preset CI tests remain in place.
- `showcase/index.html` uses updated CSS and JS versioned file URLs to invalidate stale browser caches.

## Provenance, limitations, rollback

The title/genre/rating data still come from `ml-latest-small`; the large `25M` model stays trained and compressed as in V12. The gallery is a UI view of session ratings and is cleared on the same refresh/reset conditions as before. Descriptions come from a third-party metadata endpoint, when available; attribution and external information may be inaccurate, untranslated or missing and should not be treated as model-derived movie descriptions.

- **Frozen pre-V14 main:** `62f046d25332ca28b1b554e024ef6afc1267b731`
- **Frozen backup branch:** `backup/pre-v14-showcase-2026-11-13`
- **Implementation branch:** `feat/v14-rated-library-cinematic-detail`
- **Rollback:** revert the dedicated V14 PR via a new main commit; never force-push or rewrite V13 history.
