# MovieRecLab Showcase V2 — independent, reversible

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
