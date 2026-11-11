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
