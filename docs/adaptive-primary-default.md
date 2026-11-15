# Adaptive primary recommendation

Source: https://github.com/oyueo-mm/MovieRecLab/actions/runs/43726869262 (six completed jobs). The original gate rejected all candidates because of Coverage. User approved treating primary-rail Coverage as diagnostic instead of a hard gate; all other original checks pass for exact counts 3, 5, 10, 20. This is a post-hoc gate change, not a new independent evaluation. The whole multi-rail system has not been re-evaluated for Coverage.

- 3: Hybrid + SLIM (1/2 each), NDCG .0569447908 -> .0674786336.
- 5: NCF + Association + Hybrid (1/3 each), .0622645742 -> .0778597403.
- 10: EASE + Association + Popular (1/3 each), .0715383456 -> .0813625510.
- 20: EASE + Association + User KNN (1/3 each), .0800873034 -> .0953643910.
- Every other count (including 4, 6–9, 11–19, typical 12-film presets, 50, 100) uses EASE; no unsupported interpolation. Explicit EASE and all other existing modes remain selectable. Original other recommendation algorithms/rails are untouched; discovery rails may show different movies due to their existing duplicate exclusion.
- RRF k=20, top 50 from each native ranker, equal weights, tie-break by numeric ID. Worker caches lazy fits and falls back to EASE on ensemble failure; if EASE itself fails, popularity is a final fallback. No production model files overwritten.
- Rollback: manual EASE selection or revert this release commit. Further intermediate-count validation and full multi-rail metric/latency evaluation are pending.
