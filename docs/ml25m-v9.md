# MovieRecLab V9 — MovieLens 25M + Tag Genome research integration

## Scope

This is an evidence-gated **offline-trained research overlay**, not a browser download of 25 million individual ratings and not a replacement of the original MovieRecLab learning laboratory.

The original Showcase V8, the initial movie rating UI, the three vertically stacked recommendation rows, their horizontal film browsing behavior, film search, poster fallbacks, EASE **default model**, the 22 original comparison modes, existing EDA and the original in-browser evaluation UI remain available.

Two **secondary recommendation rows** can use the newly trained model:

- **좋아한 영화와 비슷한 영화** — Tag Genome latent film features plus 25M-trained collaborative film factors. Automatically used only when its user-level test NDCG exceeds the genre-based baseline at both 5 and 10 input ratings.
- **비슷한 사용자가 좋아한 영화** — preferences aggregated over 36 groups of users whose 25M collaborative factors are similar. Automatically used only when held-out test NDCG exceeds simple 25M popularity at both input sizes. This is **cohort-based approximate neighbor scoring**, not individual User KNN.
- In the menu, **추가 추천 모델** offers three explicit, reversible choices: **검증된 25M만 적용** (default; only models passing held-out tests), **기존 추천 (V8)** (immediate full fallback), or **25M 전체 실험** (explicitly try both 25M secondary scorers even if the test criterion failed). **Do not present this experiment as a proven quality improvement.**

The **first EASE row still runs the original MovieLens latest-small model**. The static site has not loaded or retrained EASE across 25M interactions because a full 60k-plus movie dense EASE inverse would exceed reasonable browser memory. The model-level change is scoped and honestly labeled.

## Offline training

Pipeline: [scripts/train_ml25m.py](../scripts/train_ml25m.py). Run reproducibly in the isolated [train-ml25m.yml](../.github/workflows/train-ml25m.yml) GitHub Actions workflow.

1. Downloads the **official ml-25m.zip** from GroupLens to an ephemeral GitHub Actions worker.
2. Uses **both IMDb and TMDb IDs** to match MovieLens 25M with the exact IDs of the current latest-small film catalog. No fuzzy-title matches or fabricated ID mappings.
3. Parses ~25,000,095 ratings and the official Tag Genome. Ratings from designated evaluation users are excluded from training the collaborative model.
4. Fits truncated SVD collaborative film embeddings (24 dimensions) to sparse high-rating interactions. Learns 36 anonymous aggregate preference cohorts, never publishing training-user IDs, full interactions or individual ratings.
5. Compresses the 1,128-feature Tag Genome to 24-dimensional semantic film coefficients; the **raw 15.6M tag relevance values are not published**.
6. Tests models with user-level held-out ratings, 5 and 10 profile ratings, time-ordered recent relevant movies, and NDCG@10, Recall@10, Hit@10. Selects parameter weights using a distinct validation subgroup **before** measuring the held-out test subgroup.
7. Exports only [showcase/ml25m-model.js](../showcase/ml25m-model.js) and [showcase/ml25m-evaluation.json](../showcase/ml25m-evaluation.json), in total a small static payload. It is fetched **once** as a static asset and ranked in the browser from the user's current profile; neither original ratings nor raw tag scores are served.

**Limitations:** The provided Tag Genome is a precomputed feature table created from historical MovieLens content. Although individual test-user ratings are excluded from this release's SVD/cluster fitting, the upstream Tag Genome may have indirect exposure to past user data. Therefore this is **not** a strict end-to-end raw-feature-data holdout. The small-film catalog is retained to preserve the current demo's Korean titles, poster lookup, initial evaluation presets, and working recommendation algorithms.

## Accuracy and conservative rollout

See [showcase/ml25m-evaluation.json](../showcase/ml25m-evaluation.json) for exact real, numerical results. Tests based on 5 and 10 input ratings differ in relevance, so avoid assuming performance improves for every visitor.

Source-code guard:
- `source.quality.similarity===true` enables the Tag Genome row by default.
- `source.quality.user===true` enables the cohort row by default.
- If a guard is false or a user's selected films do not have enough valid 25M factors, the original V8 recommendation method is used for that row.
- The menu option **25M 전체 실험** overrides quality gates only by an explicit user choice. **기존 추천 (V8)** immediately returns both secondary rows to their previous algorithms. None of the menu options changes the original EASE row.

An experiment should not be said to beat the existing V8 User KNN without a head-to-head offline comparison on an identical frozen candidate set and user split; the existing V8 baseline was trained on a different dataset.

## Dataset conditions and credits

- [MovieLens 25M data README](https://files.grouplens.org/datasets/movielens/ml-25m-README.html) and [GroupLens MovieLens datasets](https://grouplens.org/datasets/movielens/).
- Publication acknowledgement: F. Maxwell Harper and Joseph A. Konstan (2015), *The MovieLens Datasets: History and Context*; Jesse Vig, Shilad Sen and John Riedl (2012), *The Tag Genome: Encoding Community Knowledge to Support Novel Interaction*.
- The MovieLens 25M data is provided for noncommercial research/educational use. The license restricts **redistribution of the dataset without separate permission**. The project never publishes the original ZIP, the individual ratings or raw Tag Genome matrix. It publishes low-dimensional trained numerical coefficients; whether any particular transformed model counts as redistribution under the terms should be assessed before reuse in another, especially commercial, context. No endorsement by GroupLens or the University of Minnesota is implied.

## Rollback procedure

- **Immutable-by-convention backup branch:** [backup/pre-ml25m-v9-2026-11-12](https://github.com/oyueo-mm/MovieRecLab/tree/backup/pre-ml25m-v9-2026-11-12).
- **Prior production commit:** `b50cd8555ff73fa90a4fa0f152fca39e7618fd88`.
- All additions are isolated to `/showcase/`, one new offline trainer, training/QA workflows and tests/docs.
- To return to the previous production recommendation behavior, **revert the V9 PR as a new commit on main**. Preserve the original Git history and avoid force-push. The original web app and the published earlier V8 work remain intact.
