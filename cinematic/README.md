# Cinematic UI — safe parallel preview

This directory is an independent, reversible visual experiment over MovieRecLab.

- Legacy: /MovieRecLab/
- Cinematic: /MovieRecLab/cinematic/
- The existing app and recommendation algorithms are unchanged. The new page embeds ../index.html in a same-origin iframe and injects theme.css. It does not copy or replace recommendation state or models.
- A photo-led entrance, camera parallax, transitions, film cards and a navigation overlay live only in this directory.
- Film mood photography comes from Unsplash. These photos are genre-based atmospheric placeholders, NOT official film posters, film stills or algorithm-derived imagery. An actual poster/backdrop system requires separately approved artwork sources and attribution.
- This is not a photorealistic realtime 3D renderer. Real-camera 3D flythrough remains future work.
- All existing rating, search, recommendations, presets, EDA, evaluation and visualization features remain in the original app embedded inside the preview.
- No third-party runtime JS or auto-play sound/video.

## Guaranteed rollback path

Baseline before any changes: f8024017ecdc1bab7d4f7a1e73e1c2c9e769c8b8
Stable backup branch: backup/pre-cinematic-2026-11-12
Feature branch: feat/cinematic-redesign-v1

1. User rollback: select "기존 UI로 이동" or open /MovieRecLab/. The original site is never redirected to the new UI.
2. Deployment rollback: revert the commit(s) that introduced cinematic/ via a new commit or PR, without force-pushing main. GitHub Pages may take time to republish.
3. Git rollback: the baseline branch and baseline commit remain available. The new UI makes no changes to original app logic.
4. Tests: node tests/cinematic-integration.test.js and the existing app/engine tests.
5. Do not change the default route or the original algorithms as part of a visual update without separate approval.

## Limitations

- This route requires same-origin iframe scripting on the same GitHub Pages project host.
- Atmospheric Unsplash photos can fail while offline. The base UI remains functional.
- Transitions are camera-like CSS presentation, not actual freely navigable 3D space.
- Check high-DPI mobile performance in a real browser; reduced-motion and responsive fallbacks are included.

## Scroll-driven entrance (2026-11-12)

- The entrance and original rating application now share a pinned scene viewport. Native vertical scrolling changes a camera zoom, soft focus, fade and reveal continuously, rather than swapping two pages.
- One downward mouse-wheel gesture on the entrance starts a smooth descent; touch swiping scrubs the same timeline. The original Start button still reaches the rating screen without reloading.
- Return to the entrance with the top-left arrow, or scroll upward while the embedded app is already at the top and no dialog is open.
- Keyboard scrolling remains native. Reduced-motion preference uses an instant scene change instead of animated movement.
- The original route and recommendation engine remain untouched; the prior cinematic release is preserved by `backup/pre-scroll-transition-2026-11-12` at `a9dcbbb8c8989dde34d2573e652f5b99ea81e294`.
- Revert the scroll-transition PR to restore the previous cinematic entrance. Open `/MovieRecLab/` to bypass all cinematic UI changes.

## Minimal text pass (2026-11-12)

- Decorative intro step numbers, introductory rule, visible Start caption, menu sequence numbers, redundant menu headings and footer copy are removed. The icon-only start control retains an accessible label. Browser tab title shortened to `영화 추천`; browser/Android system chrome is controlled by the browser, not this page.
- The cinematic skin hides supporting genres/original titles on rating cards and redundant recommendation microcopy, but retains movie names, search, progress, stars, algorithms, charts and data values. Full recommendation details remain accessible on selection.
- Research notes, evaluation limitations, detailed model descriptions, attribution and visualization explanations are collapsed under accessible native `details`, rather than deleted.
- Only the cinematic route is modified. Original non-cinematic UI is unchanged. Previous release is preserved at `backup/pre-text-minimal-2026-11-12`, commit `5549e67ba1459beb4bc30b07fc71dbae63151293`.
- Revert the minimal-copy PR to return to the previous cinematic layout, or open `/MovieRecLab/` for original design.
