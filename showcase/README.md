# MovieRecLab Showcase V2 — independent, reversible

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
- Unchanged legacy route: /MovieRecLab/.
- Unchanged previous experiment: /MovieRecLab/cinematic/.
- New route: /MovieRecLab/showcase/.
- Immediate user fallback: open the original route; original users are not redirected.
- Deployment rollback: revert the dedicated showcase merge in a new GitHub commit/PR and verify GitHub Pages published the earlier tree. No force push or reset.
- Source bridge is injected only in the showcase iframe and never changes the source app's public API.

## Tests
Run node tests/showcase.test.js after installing jsdom@26, and the original engine and DOM test suites. GitHub Actions showcase.yml runs these on feature-branch push and PR.

Known limitations: high-resolution images require external network access; mobile visual quality and network failures need real-device verification beyond DOM tests. This is a film-poster showcase, not actual 3D rendering.
