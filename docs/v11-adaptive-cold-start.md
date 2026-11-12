# MovieRecLab V11 — Cold-start adaptive recommendation

## User-visible behavior

V11 changes **only** the third (“좋아한 영화와 비슷한 영화”) recommendation row when an independently verified profile-size setting is available. The EASE main row, V8 User KNN second row, UI structure, poster recovery, movie ratings, search, advanced algorithms, and research pages remain the same. The existing Netflix-like 3-rail layout does not change.

- By default **검증된 모델 자동 선택** evaluates the number of ratings and selects the accepted V11 bucket if any, otherwise keeps existing V10 and its V9/V8 safeguards.
- The existing menu provides **V11 적응형 추천 실험** to explicitly try a bucket which failed validation-test acceptance, and distinct **V10**, **V9**, **V8** choices for instant rollback without changing ratings.
- V11 uses only a ~580-byte static weight schedule plus the already deployed V10 compact Item KNN / V9 Tag Genome coefficients. Raw user ratings are not sent to a new server and no additional large model is downloaded.

### Adaptive model

The previously trained Item KNN/Tag Genome relevance becomes a signal among several. The other signal is the 25M-trained item popularity. The final score for candidate film `i` is:

`score(i|u) = gamma(n) * V10_score(i|u,negativeScale(n)) + (1-gamma(n)) * popularity_25m(i)`

where the score's parameters depend on the number `n` of rated movies. Negative feedback is still used, but validation may choose whether to downweight 1/2-star feedback. The 25M item popularity is stored as a quantized training-set log frequency. **Gamma is not chosen on the test users.**

The offline fit uses discrete profile sizes **3, 5, 10, 20, 50, 100**; in the browser, intermediate counts use the largest tested count less than or equal to their actual count. That interpolation is a **pragmatic bucket assignment**, not independently validated performance for every possible rating count.

## 25M experiment and independent release gates

- Download official MovieLens 25M into a transient GitHub Actions runner; use an IMDb **and** TMDb ID match to align with the current MovieRecLab catalog.
- Exclude 320 users entirely from model training. Use **160 validation / 160 test users**, of whom 156 are eligible for the 3, 5 and 10 profile evaluations, fewer for higher counts.
- For each profile size, take the earliest `n` ratings as a new-user profile and evaluate on the newest 20% of positively rated (4+) items. For every variant and baseline use the **same** eligible test users and ~9,448 movie candidate universe.
- Search a predeclared grid of popularity/personalization mixing coefficients `gamma` (0, 0.10, 0.25, 0.40, 0.55, 0.70, 0.85, 1) and negative-feedback scaling (0.5, 1.0) on **validation users only**. User-based KNN shrinkage alternatives are evaluated separately and **not automatically deployed**, since the browser deliberately never receives the 25M per-user rating matrix.
- Measure NDCG@10, Recall@10, HitRate@10 and **catalog coverage** for each. Release individual buckets only when test-user NDCG is greater than V10 and Recall@10 is no worse than 0.002 below V10. Otherwise V10 remains default for that bucket.
- Dataset licensing and provenance remain documented in [V10 research report](v10-model-tournament.md) and the [MovieLens 25M official README](https://files.grouplens.org/datasets/movielens/ml-25m-README.html). No raw 25M ratings, original Tag Genome table or individual training-user profiles are published.

### Observed test results

Source of truth: [showcase/v11-benchmark.json](../showcase/v11-benchmark.json).

| Rated movies | Test users | V10 NDCG@10 | Selected V11 NDCG@10 | V11 adopted by default? |
| ---: | ---: | ---: | ---: | :--- |
| 3 | 156 | 0.033209 | **0.044474** | Yes |
| 5 | 156 | 0.032837 | **0.045004** | Yes |
| 10 | 156 | 0.051123 | **0.052344** | Yes |
| 20 | 146 | 0.051406 | 0.051406 | No (no meaningful gain) |
| 50 | 91 | **0.041684** | 0.035574 | No |
| 100 | 55 | **0.057275** | 0.054799 | No |

**Crucial qualifications:** For five rated movies the **popularity-only baseline scores 0.045159**, slightly above V11 0.045004. Thus V11 improves over the previous **personalized V10**, not over popularity in every condition. At 3 ratings V11 also falls slightly below popularity (0.044848). For 10 movies, V11 beats both V10 and popularity (0.046490).

The increased importance of popularity in 3/5-film cold start sharply **reduces catalog coverage** (5-film V10: 373 distinct recommended films across test subjects; V11: 41). This is a measurable **accuracy–diversity tradeoff**, not an improvement in every quality dimension. V11 does not yet introduce diversity-aware reranking. It should be considered for future versions if users value novelty and coverage as much as immediate hit probability.

NDCG values and differences are raw observations for 156 (or fewer) excluded test users; no claim of statistical significance or universal live-user improvement is made. The precomputed upstream Tag Genome may contain historical signals, so complete end-to-end independent feature isolation is not guaranteed.

### User KNN outcome

25M User KNN is **still an offline experimental comparator**. With 5 ratings it improved from 0.029622 to 0.036638 using a one-common-item shrinkage alternative, but under 10 ratings it did **not** improve over the original 0.043790 KNN benchmark. No head-to-head test against original small-data V8 User KNN has been made. We therefore **do not** claim to have improved the second rail; the V8 User KNN remains as before, and no raw training-user history is distributed.

## Deployment and rollback

- [V11 reproducible training pipeline](../scripts/benchmark_v11.py) and [GitHub Action](../.github/workflows/train-v11.yml).
- [Model adapter](../showcase/v11-recommender.js) and [tiny trained schedule](../showcase/v11-config.js).
- [V10 production backup: backup/pre-v11-adaptive-2026-11-12](https://github.com/oyueo-mm/MovieRecLab/tree/backup/pre-v11-adaptive-2026-11-12), HEAD `5b1eba59b53618778c3d0667c2bffd48b27cfc00`.
- Instant in-app rollback through "추가 추천 모델" → V10 / V9 / V8. A complete release rollback is a regular **revert of the single V11 PR** (no force push, no history rewrite).
- The existing new-user 3–5-star input page, movie cards, and recommendation row names are unmodified.

