# Feedback Radar - Smoke Tests

Complete curl test suite for all SPEC endpoints with expected outputs.

## Prerequisites

1. Deploy the worker or run locally:
   ```bash
   npx wrangler dev
   # OR
   npx wrangler deploy
   ```

2. Set the WORKER_URL environment variable:
   ```bash
   # For local development
   export WORKER_URL="http://localhost:8787"

   # For production
   export WORKER_URL="https://pm-assessment.<your-subdomain>.workers.dev"
   ```

3. Apply migrations if not done already:
   ```bash
   npx wrangler d1 migrations apply feedback-radar-db
   ```

---

## Test 1: Seed Database

**Command:**
```bash
curl -X POST "$WORKER_URL/api/seed" \
  -H "Content-Type: application/json"
```

**Expected Output:**
```json
{
  "success": true,
  "inserted": 5,
  "message": "Seeded 5 sample feedback items"
}
```

**Notes:**
- First run: Should insert 5 items
- Subsequent runs: Should insert 0 (duplicates skipped by fingerprint)

---

## Test 2: List All Feedback

**Command:**
```bash
curl "$WORKER_URL/api/feedback"
```

**Expected Output:**
```json
{
  "data": [
    {
      "id": 5,
      "source": "intercom",
      "title": "Cannot reset password",
      "body": "I've tried resetting my password 3 times but never receive the email. Checked spam folder too. Please help urgently!",
      "created_at": "2026-01-11T23:45:00.000Z",
      "fingerprint": "intercom-chat-005",
      "analysis_status": "pending"
    },
    {
      "id": 4,
      "source": "github",
      "title": "Feature request: Dark mode",
      "body": "It would be great to have a dark mode option. Working late at night, the bright UI strains my eyes.",
      "created_at": "2026-01-11T23:45:00.000Z",
      "fingerprint": "github-issue-004",
      "analysis_status": "pending"
    }
    // ... more items (ordered by created_at DESC)
  ],
  "total": 5,
  "limit": 20,
  "offset": 0
}
```

---

## Test 3: List Feedback with Filters

**Test 3a: Filter by source**
```bash
curl "$WORKER_URL/api/feedback?source=github"
```

**Expected:** Only feedback from GitHub

**Test 3b: Search by keyword**
```bash
curl "$WORKER_URL/api/feedback?q=password"
```

**Expected:** Feedback with "password" in title or body

**Test 3c: Pagination**
```bash
curl "$WORKER_URL/api/feedback?limit=2&offset=0"
```

**Expected Output:**
```json
{
  "data": [
    // 2 items only
  ],
  "total": 5,
  "limit": 2,
  "offset": 0
}
```

**Test 3d: Invalid limit (validation test)**
```bash
curl "$WORKER_URL/api/feedback?limit=abc"
```

**Expected:** 400 Bad Request with validation error

---

## Test 4: Get Specific Feedback

**Command:**
```bash
curl "$WORKER_URL/api/feedback/1"
```

**Expected Output:**
```json
{
  "feedback": {
    "id": 1,
    "source": "github",
    "title": "API response time is too slow",
    "body": "The /api/users endpoint takes 5+ seconds to respond. This is causing timeouts in our mobile app. We need better performance.",
    "created_at": "2026-01-11T23:45:00.000Z",
    "fingerprint": "github-issue-001",
    "analysis_status": "pending"
  },
  "analysis": null
}
```

**Test 4b: Non-existent ID**
```bash
curl "$WORKER_URL/api/feedback/9999"
```

**Expected:**
```json
{
  "error": "Feedback not found"
}
```
Status: 404

---

## Test 5: Create New Feedback

**Command:**
```bash
curl -X POST "$WORKER_URL/api/feedback" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "slack",
    "title": "Integration with Jira broken",
    "body": "The Jira integration stopped working after the last update. We cannot sync issues anymore."
  }'
```

**Expected Output:**
```json
{
  "id": 6,
  "source": "slack",
  "title": "Integration with Jira broken",
  "body": "The Jira integration stopped working after the last update. We cannot sync issues anymore.",
  "created_at": "2026-01-11T23:50:00.000Z",
  "fingerprint": "a1b2c3d4e5f6g7h8",
  "analysis_status": "pending"
}
```
Status: 201

**Test 5b: Duplicate feedback (same source/title/body)**
```bash
curl -X POST "$WORKER_URL/api/feedback" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "slack",
    "title": "Integration with Jira broken",
    "body": "The Jira integration stopped working after the last update. We cannot sync issues anymore."
  }'
```

**Expected:** Returns existing feedback with same fingerprint
Status: 201

---

## Test 6: Analyze Feedback

**Command:**
```bash
curl -X POST "$WORKER_URL/api/analyze/1"
```

**Expected Output:**
```json
{
  "sentiment": {
    "label": "negative",
    "confidence": 0.89
  },
  "urgency": {
    "score": 85,
    "reason": "Critical performance issue affecting mobile app users, causing timeouts"
  },
  "themes": [
    {
      "theme": "Performance",
      "impact_area": "API",
      "evidence_quote": "The /api/users endpoint takes 5+ seconds to respond"
    },
    {
      "theme": "Mobile Experience",
      "impact_area": "Client Apps",
      "evidence_quote": "causing timeouts in our mobile app"
    }
  ],
  "summary": "Critical API performance issue causing mobile app timeouts. Requires immediate investigation.",
  "next_action": "Profile /api/users endpoint and optimize database queries or add caching"
}
```

**Notes:**
- First call: Runs AI analysis, stores in D1, caches for 6h
- Second call (within 6h): Returns cached result instantly
- Actual AI output will vary but must match the JSON schema

**Test 6b: Non-existent feedback**
```bash
curl -X POST "$WORKER_URL/api/analyze/9999"
```

**Expected:**
```json
{
  "error": "Feedback not found"
}
```
Status: 404

**Test 6c: AI failure simulation**
If AI fails, should return:
```json
{
  "error": "Analysis failed",
  "message": "<error details>",
  "feedback_id": "1"
}
```
Status: 500

---

## Test 7: Get Digest (24h window)

**Command:**
```bash
curl "$WORKER_URL/api/digest?window=24h"
```

**Expected Output:**
```json
{
  "window": "24h",
  "total_feedback": 6,
  "sentiment_breakdown": {
    "positive": 1,
    "neutral": 1,
    "negative": 4
  },
  "avg_urgency": 67,
  "top_themes": [
    {
      "theme": "Performance",
      "count": 3
    },
    {
      "theme": "Authentication",
      "count": 2
    },
    {
      "theme": "UI/UX",
      "count": 1
    }
  ],
  "sources": [
    {
      "source": "github",
      "count": 2
    },
    {
      "source": "slack",
      "count": 2
    },
    {
      "source": "intercom",
      "count": 1
    },
    {
      "source": "email",
      "count": 1
    }
  ]
}
```

**Test 7b: 7-day window**
```bash
curl "$WORKER_URL/api/digest?window=7d"
```

**Expected:** Similar structure, but includes last 7 days of data

**Notes:**
- First call: Queries D1, caches for 10m
- Calls within 10m: Returns cached result
- Themes only appear if feedback has been analyzed

---

## Test 8: Find Similar Feedback

**Prerequisites:** Analyze at least 2-3 feedback items first

**Command:**
```bash
# First, analyze a few items
curl -X POST "$WORKER_URL/api/analyze/1"
curl -X POST "$WORKER_URL/api/analyze/3"
curl -X POST "$WORKER_URL/api/analyze/5"

# Then find similar
curl "$WORKER_URL/api/similar/1"
```

**Expected Output:**
```json
{
  "similar": [
    {
      "feedback_id": 3,
      "id": 3,
      "source": "email",
      "title": "Bug in export feature",
      "body": "When I try to export data to CSV, the file is corrupted and won't open in Excel. This is blocking our quarterly reporting.",
      "created_at": "2026-01-11T23:45:00.000Z",
      "fingerprint": "email-ticket-003",
      "analysis_status": "completed",
      "similarity_score": 0.33,
      "matching_themes": ["data processing", "critical bug"]
    },
    {
      "feedback_id": 5,
      "id": 5,
      "source": "intercom",
      "title": "Cannot reset password",
      "body": "I've tried resetting my password 3 times...",
      "created_at": "2026-01-11T23:45:00.000Z",
      "fingerprint": "intercom-chat-005",
      "analysis_status": "completed",
      "similarity_score": 0.25,
      "matching_themes": ["authentication"]
    }
  ]
}
```

**Test 8b: Feedback not analyzed**
```bash
curl "$WORKER_URL/api/similar/2"
```

**Expected:**
```json
{
  "error": "Feedback not found or not analyzed"
}
```
Status: 404

**Notes:**
- Uses Jaccard similarity on themes (Phase 1)
- Returns top 10 matches, sorted by score
- Cached for 30m
- Empty array if no similar items found

---

## Complete Test Sequence

Run all tests in order:

```bash
# Set your worker URL
export WORKER_URL="http://localhost:8787"

# 1. Seed database
curl -X POST "$WORKER_URL/api/seed"

# 2. List all feedback
curl "$WORKER_URL/api/feedback"

# 3. Get specific feedback
curl "$WORKER_URL/api/feedback/1"

# 4. Create new feedback
curl -X POST "$WORKER_URL/api/feedback" \
  -H "Content-Type: application/json" \
  -d '{"source":"test","title":"Test feedback","body":"This is a test"}'

# 5. Analyze feedback items
curl -X POST "$WORKER_URL/api/analyze/1"
curl -X POST "$WORKER_URL/api/analyze/2"
curl -X POST "$WORKER_URL/api/analyze/3"

# 6. Get digest
curl "$WORKER_URL/api/digest?window=24h"

# 7. Find similar
curl "$WORKER_URL/api/similar/1"

echo "✅ All smoke tests completed!"
```

---

## Validation Checklist

- [ ] All endpoints return valid JSON (no HTML errors)
- [ ] Error responses include `{ "error": "..." }` with appropriate status codes
- [ ] KV caching works (second calls are faster)
- [ ] Workers AI returns JSON matching SPEC schema
- [ ] D1 data persists across requests
- [ ] Fingerprint deduplication works
- [ ] Query parameters are validated (400 on invalid input)
- [ ] Pagination works correctly
- [ ] Theme-based similarity returns reasonable matches

---

## Troubleshooting

**Issue:** 500 Internal Server Error
- Check wrangler logs: `npx wrangler tail`
- Verify migrations applied: `npx wrangler d1 execute feedback-radar-db --command "SELECT * FROM sqlite_master WHERE type='table'"`
- Check bindings in wrangler.jsonc

**Issue:** "Feedback not found" on /api/similar/:id
- Ensure feedback exists and has been analyzed
- Check: `curl "$WORKER_URL/api/feedback/:id"` and verify `analysis_status: "completed"`

**Issue:** AI analysis fails
- Workers AI requires production deployment (doesn't work in local dev)
- Check account has Workers AI enabled
- Verify model name: `@cf/meta/llama-3.1-8b-instruct`

**Issue:** Cached responses not updating
- KV cache has TTLs: analysis (6h), digest (10m), similar (30m)
- For testing, either wait for TTL or manually clear cache
