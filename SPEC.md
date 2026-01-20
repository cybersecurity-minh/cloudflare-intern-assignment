# SPEC — Feedback Radar

## Products
Workers + D1 + KV + Workers AI (JSON Mode)

## Endpoints
POST /api/seed
POST /api/feedback
GET  /api/feedback?source=&q=&limit=&offset=
GET  /api/feedback/:id
POST /api/analyze/:id
GET  /api/digest?window=24h|7d
GET  /api/similar/:id

## Workers AI JSON schema (MUST MATCH)
{
  "sentiment": { "label": "positive|neutral|negative", "confidence": 0.0 },
  "urgency": { "score": 0, "reason": "" },
  "themes": [{ "theme": "", "impact_area": "", "evidence_quote": "" }],
  "summary": "",
  "next_action": ""
}

## KV cache keys + TTL
analysis:{id}  -> TTL 6h
digest:24h     -> TTL 10m
digest:7d      -> TTL 10m
similar:{id}   -> TTL 30m

## D1 tables (minimal)
feedback: id, source, title, body, created_at, fingerprint, analysis_status
analysis: feedback_id, sentiment_label, sentiment_confidence, urgency_score, urgency_reason,
         themes_json, summary, next_action, model, updated_at, error

## Smoke tests (to be completed)
- curl POST /api/seed
- curl GET /api/feedback
- curl POST /api/analyze/:id
- curl GET /api/digest?window=24h
- curl GET /api/similar/:id
