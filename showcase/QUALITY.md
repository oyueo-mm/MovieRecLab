# V6 — Poster recovery and evidence-tested recommendation updates

## V7 — Verified poster registry (2026-11-12)

**Problem:** V6 tried several Metahub variants and Cinemeta lookups, but these often resolved to the same failing image. User screenshots showed multiple title-only tiles in the multi-row recommendations.

**Fix:** `showcase/poster-map.js` is a generated, static registry of **9,522 film-specific TMDb poster paths**, identified by matching **both IMDb and TMDb IDs** against the MovieLens latest-small `links.csv` records. The dataset has 9,742 movies; 9,734 have both IDs, and 9,522 rows were matched to poster paths. Thus about **97.7% of catalog titles have an identified poster path**, which is NOT the same as a verified HTTP 200 image success rate.

**Runtime priority:** cached successful poster > movie-ID-validated `image.tmdb.org/t/p/w342` path > the small curated movie list > existing Metahub/Cinemeta fallback chain > original title card. Every URL is HTTPS on an approved image host and every image error still advances to the next film-matched source.

**Build provenance:**
- GroupLens MovieLens latest-small `links.csv`: [pinned mirror](https://github.com/smanihwr/ml-latest-small/tree/ba3cd91761e54faa64483456b619d1a1f4d70971)
- [TMDb-derived public movie metadata](https://github.com/sachinmasti/movie-data-cleaning/tree/8be8af3197fdfbfeca1c25eee76f3e6c8973c701) (`movies_metadata.csv`, 45k films). The generator **requires the IMDb ID and TMDb ID to match simultaneously**, rejects invalid poster paths, and records conflicts.
- Generator: `scripts/build-poster-map.py`, which stores **only URLs' poster file paths**, not the copyrighted poster images. The actual media remains served by TMDb. TMDb attribution in the Showcase credits is unchanged.

The map is generated through an isolated GitHub Action on the feature branch and committed to `showcase/poster-map.js`. `showcase/index.html` loads it before `art.js`; no changes were made to the recommendation engine, movie ratings, three-row structure or evaluation algorithm.

**Limitations:** The 45k metadata snapshot includes older films and may have stale image paths, so a small subset may still fail. Real-browser network restrictions and image hosting availability cannot be guaranteed by a checked dataset path. The map is roughly 405 KB uncompressed, is cached as a static JavaScript asset and is not repeatedly fetched per image.

**Rollback:** Pre-change `main` commit `00c8a73457aa0d46b12462003638bd1e066d476b` preserved at `backup/pre-poster-coverage-v7-2026-11-12`. Revert only the V7 pull request to restore the V6 poster loader and previously approved multi-row design; never force push or overwrite the backup.

---


This release changes only image retrieval and recommendation scoring. The existing cinematic hero, rating flow, three ranked recommendation rows, search and research views retain their structure.

## Posters

- Existing 9 curated TMDb poster/backdrop paths are retained.
- For any MovieLens title with a valid IMDb ID, image loading now checks the matching Metahub medium and small poster URLs, a metadata-returned Cinemeta poster URL, and two independent Cinemeta metadata hosts as necessary. No title or genre-based guesswork is used to attach another film's poster.
- All poster URLs are accepted only from an allowlist of HTTPS media origins. Each image is loaded with an onerror fallback; a successful poster is preferred for subsequent views within the session.
- The loader is shared by the featured-film carousel, all three ranked recommendation rows, movie search, film detail, and algorithm-comparison poster rows.
- Metadata fetches are queued at four concurrent requests and time out after 5.2 seconds per host. Missing metadata is cached for a short duration rather than forever. Lazy loading is preserved.
- **Limit:** External providers can have missing artworks or block requests. When no matching image is available, a title card remains. We do not promise 100% poster coverage or embed/unlicensed film artworks in this repository.

## Recommendation accuracy

MovieLens latest-small; 610 total users, 9,742 movies and 100,836 ratings. **For evaluation only**, 44 timestamped users were selected deterministically and completely excluded from the fit set. The fitted model used 566 users and 92,024 ratings. Each excluded user provided either the first 5 or first 10 ratings as a profile. The most recent 20% of that user's ratings (>=4 stars, items rated >=2 times in training) were the relevant targets. 43 users had valid targets.

Measurements: offline NDCG@10 (higher is better), Recall@10, Hit@10 and Catalog Coverage. This is a *single holdout*, not a statistical significance or production-A/B result.

| Method | Ratings in profile | Prior NDCG@10 | Updated NDCG@10 | Prior Recall@10 | Updated Recall@10 |
| --- | --- | ---: | ---: | ---: | ---: |
| User KNN | 5 | 0.04011 | 0.05021 | 0.02499 | 0.02593 |
| User KNN | 10 | 0.03486 | 0.04358 | 0.02937 | 0.02911 |
| Content vs content+item similarity | 5 | 0.04276 | 0.05405 | 0.02329 | 0.03477 |
| Content vs content+item similarity | 10 | 0.02080 | 0.03147 | 0.00355 | 0.00671 |

**User-KNN selection:** A rank-fusion ensemble of 25% previous User KNN and 75% evidence-weighted User KNN. This raised NDCG by approximately 25% in each profile condition. **Trade-off:** In the 10-rating condition, Recall was nearly unchanged but slightly lower; Hit@10 fell from 0.23256 to 0.20930 and coverage from 71 to 42. This is an accuracy/diversity compromise to revisit when larger validation data is available.

**Similar-film row:** Uses genuine Content similarity (genre/tag) + Item-based collaborative similarity, equally weighted by reciprocal rank fusion. It is labeled **콘텐츠·아이템 유사도**, rather than pretending to be pure content filtering. A separate pure **콘텐츠 기반** model remains available in the algorithm menu, unchanged after a tested new pure-content candidate performed worse. Original EASE default remains unchanged.

The row itself is still called **좋아한 영화와 비슷한 영화** and maintains top-to-bottom layout and left-to-right rank ordering exactly as V5. User KNN has no artificial popularity filler in its row, and the similar-film row has no popularity-only filler either.

Evaluation script: `tests/quality-ab-live.js`. It uses the same public, pinned MovieLens file source already used by the application and requires both revised methods to beat their older comparators in both profile sizes.

## Validation and rollback

- Unit/DOM checks: `tests/poster-recovery.test.js`, `tests/recommend-upgrades.test.js`, existing showcase test suites.
- Real MovieLens holdout: `node tests/quality-ab-live.js` (network required).
- Recovery branch: `backup/pre-poster-recommend-v6-2026-11-12`.
- Pre-change SHA: `8e7e3d08f681d7c4cf80d0e903fb36a2cf5020d6`.
- To roll back just these changes, revert the dedicated V6 pull request as a new commit on main. Do **not** force-push or change the backup branch. The approved V5 ranked three-row layout remains intact in both versions.

### Sources
- [MovieLens latest-small README](https://files.grouplens.org/datasets/movielens/ml-latest-small-README.html)
- [Pinned MovieLens CSV mirror](https://github.com/smanihwr/ml-latest-small/tree/ba3cd91761e54faa64483456b619d1a1f4d70971)
- [TMDb image path format](https://developer.themoviedb.org/docs/image-basics)
