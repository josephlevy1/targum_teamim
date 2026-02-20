# Manuscript Confidence Report JSON

Endpoint: `GET /api/manuscripts/export/confidence`

## Top-level shape

```json
{
  "normalization": "NFC",
  "items": [
    {
      "verseId": "Genesis:1:1",
      "selectedSource": "vatican_ms_448",
      "ensembleConfidence": 0.88,
      "flags": ["DISAGREEMENT_FLAG"],
      "reasonCodes": ["HIGH_CONFIDENCE_DISAGREEMENT"],
      "witnessConfidences": [
        {
          "witnessId": "vatican_ms_448",
          "sourceConfidence": 0.91,
          "clarityScore": 0.9,
          "matchScore": 0.86,
          "completenessScore": 1,
          "status": "ok"
        }
      ]
    }
  ]
}
```

## Notes
- `ensembleConfidence` is computed during cascade selection.
- `flags` includes disagreement/quality indicators for review queues.
- `witnessConfidences` mirrors witness panel values used in UI.
