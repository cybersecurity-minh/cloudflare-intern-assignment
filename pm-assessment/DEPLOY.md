# Deployment Guide - Feedback Radar

Quick guide to deploy and test the Feedback Radar Worker.

---

## Prerequisites

✅ Cloudflare account
✅ Wrangler CLI installed (`npm install -g wrangler`)
✅ D1 database created: `feedback-radar-db`
✅ KV namespace created: `feedback-radar-cache`
✅ Bindings configured in `wrangler.jsonc`

---

## Step 1: Verify Bindings

Check that `wrangler.jsonc` has correct IDs:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "feedback-radar-db",
      "database_id": "faa25392-c85b-404a-bc22-a9d879980509"
    }
  ],
  "kv_namespaces": [
    {
      "binding": "CACHE",
      "id": "5aa4bdcdba2e48c98b3f7e604370bc24"
    }
  ],
  "ai": {
    "binding": "AI"
  }
}
```

---

## Step 2: Apply Migrations

```bash
cd pm-assessment
npx wrangler d1 migrations apply feedback-radar-db
```

**Expected output:**
```
✔ About to apply 1 migration(s)
...
✔ Successfully applied 1 migration(s)
```

**Verify:**
```bash
npx wrangler d1 execute feedback-radar-db --command "SELECT name FROM sqlite_master WHERE type='table'"
```

Should see: `feedback`, `analysis`

---

## Step 3: Deploy to Cloudflare

```bash
npx wrangler deploy
```

**Expected output:**
```
Total Upload: xx.xx KiB / gzip: xx.xx KiB
Uploaded pm-assessment (x.xx sec)
Published pm-assessment (x.xx sec)
  https://pm-assessment.<your-subdomain>.workers.dev
```

**Save your Worker URL!**

---

## Step 4: Run Smoke Tests

Set your worker URL:

```bash
export WORKER_URL="https://pm-assessment.<your-subdomain>.workers.dev"
```

### Test 1: Seed Database

```bash
curl -X POST "$WORKER_URL/api/seed" -H "Content-Type: application/json"
```

✅ Should return: `{ "success": true, "inserted": 5, "message": "Seeded 5 sample feedback items" }`

---

### Test 2: List Feedback

```bash
curl "$WORKER_URL/api/feedback"
```

✅ Should return: JSON with `data`, `total`, `limit`, `offset`

---

### Test 3: Create Feedback

```bash
curl -X POST "$WORKER_URL/api/feedback" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "github",
    "title": "Test Issue",
    "body": "This is a test feedback for smoke testing"
  }'
```

✅ Should return: 201 with created feedback object

---

### Test 4: Analyze Feedback

```bash
curl -X POST "$WORKER_URL/api/analyze/1"
```

✅ Should return: AI analysis with sentiment, urgency, themes, summary, next_action

**Note:** This requires Workers AI (production only). If you get an error about AI not being available, your account may need Workers AI enabled.

---

### Test 5: Get Digest

```bash
curl "$WORKER_URL/api/digest?window=24h"
```

✅ Should return: Aggregate stats with sentiment_breakdown, avg_urgency, top_themes, sources

---

### Test 6: Find Similar

First analyze a few items:
```bash
curl -X POST "$WORKER_URL/api/analyze/1"
curl -X POST "$WORKER_URL/api/analyze/2"
curl -X POST "$WORKER_URL/api/analyze/3"
```

Then find similar:
```bash
curl "$WORKER_URL/api/similar/1"
```

✅ Should return: Array of similar feedback with similarity_score and matching_themes

---

## Step 5: Verify All Endpoints

Use the complete test script:

```bash
#!/bin/bash

export WORKER_URL="https://pm-assessment.<your-subdomain>.workers.dev"

echo "1. Seeding database..."
curl -X POST "$WORKER_URL/api/seed"

echo -e "\n\n2. Listing feedback..."
curl "$WORKER_URL/api/feedback?limit=5"

echo -e "\n\n3. Getting feedback #1..."
curl "$WORKER_URL/api/feedback/1"

echo -e "\n\n4. Creating new feedback..."
curl -X POST "$WORKER_URL/api/feedback" \
  -H "Content-Type: application/json" \
  -d '{"source":"test","title":"Smoke test","body":"Testing deployment"}'

echo -e "\n\n5. Analyzing feedback..."
curl -X POST "$WORKER_URL/api/analyze/1"

echo -e "\n\n6. Getting digest..."
curl "$WORKER_URL/api/digest?window=24h"

echo -e "\n\n7. Finding similar..."
curl -X POST "$WORKER_URL/api/analyze/2"
curl -X POST "$WORKER_URL/api/analyze/3"
curl "$WORKER_URL/api/similar/1"

echo -e "\n\n✅ All tests completed!"
```

---

## Step 6: Check Logs

Monitor your worker in real-time:

```bash
npx wrangler tail
```

This will show:
- Incoming requests
- Console logs
- Errors
- Response times

---

## Troubleshooting

### Issue: "binding 'DB' not found"

**Solution:** Verify D1 binding in wrangler.jsonc and redeploy

```bash
npx wrangler deploy
```

---

### Issue: "binding 'CACHE' not found"

**Solution:** Verify KV namespace exists:

```bash
npx wrangler kv:namespace list
```

Should show your namespace. Update the ID in wrangler.jsonc.

---

### Issue: "binding 'AI' not found" or AI errors

**Solutions:**
1. Workers AI only works in production (not `wrangler dev`)
2. Check if your account has Workers AI enabled
3. Verify model name: `@cf/meta/llama-3.1-8b-instruct`

```bash
# Test AI binding
npx wrangler dev --remote
```

---

### Issue: 500 errors on /api/analyze

**Check:**
1. Feedback exists: `curl "$WORKER_URL/api/feedback/1"`
2. View logs: `npx wrangler tail`
3. Test Workers AI:
   ```bash
   curl -X POST "$WORKER_URL/api/analyze/1"
   ```
   Check response for error details

---

### Issue: Empty results in /api/digest

**Cause:** No feedback has been analyzed yet

**Solution:** Analyze some feedback first:
```bash
curl -X POST "$WORKER_URL/api/analyze/1"
curl -X POST "$WORKER_URL/api/analyze/2"
```

---

### Issue: /api/similar returns empty array

**Cause:** Not enough analyzed feedback or no theme overlap

**Solution:**
1. Analyze at least 2-3 feedback items
2. Verify themes exist:
   ```bash
   npx wrangler d1 execute feedback-radar-db \
     --command "SELECT feedback_id, themes_json FROM analysis WHERE themes_json IS NOT NULL"
   ```

---

## Production Checklist

Before going live:

- [ ] All migrations applied
- [ ] Seed endpoint tested (returns 5 items)
- [ ] CRUD operations work (create, read, list)
- [ ] Workers AI analysis returns valid JSON
- [ ] KV caching working (check logs for cache hits)
- [ ] Error handling returns JSON (not HTML)
- [ ] Query validation working (400 on invalid params)
- [ ] Pagination tested
- [ ] All 7 endpoints return expected responses
- [ ] Logs show no errors

---

## Performance Tips

**Cache verification:**
```bash
# First call (cache miss)
time curl "$WORKER_URL/api/analyze/1"

# Second call (cache hit - should be much faster)
time curl "$WORKER_URL/api/analyze/1"
```

**D1 query optimization:**
```bash
# Check index usage
npx wrangler d1 execute feedback-radar-db \
  --command "EXPLAIN QUERY PLAN SELECT * FROM feedback WHERE source = 'github'"
```

Should show index scan, not full table scan.

---

## Useful Commands

**View all feedback:**
```bash
npx wrangler d1 execute feedback-radar-db \
  --command "SELECT id, source, title, analysis_status FROM feedback"
```

**View all analysis:**
```bash
npx wrangler d1 execute feedback-radar-db \
  --command "SELECT feedback_id, sentiment_label, urgency_score FROM analysis"
```

**Clear KV cache (for testing):**
```bash
npx wrangler kv:key delete "analysis:1" --namespace-id="5aa4bdcdba2e48c98b3f7e604370bc24"
```

**Check table counts:**
```bash
npx wrangler d1 execute feedback-radar-db \
  --command "SELECT 'feedback' as table_name, COUNT(*) as count FROM feedback UNION SELECT 'analysis', COUNT(*) FROM analysis"
```

---

## OpenAPI Documentation

Your deployed worker includes interactive API docs:

**URL:** `https://pm-assessment.<your-subdomain>.workers.dev/`

This shows:
- All endpoints
- Request/response schemas
- Try it out functionality

---

## Next Steps

1. **Run full test suite** from SMOKE_TESTS.md
2. **Monitor logs** with `npx wrangler tail`
3. **Test edge cases** (invalid IDs, malformed JSON, etc.)
4. **Verify caching** (second calls should be faster)
5. **Check OpenAPI docs** (visit worker root URL)

---

## Support Resources

- **Full test suite:** SMOKE_TESTS.md
- **Implementation details:** IMPLEMENTATION_SUMMARY.md
- **SPEC reference:** SPEC.md
- **Wrangler docs:** https://developers.cloudflare.com/workers/wrangler/
- **D1 docs:** https://developers.cloudflare.com/d1/
- **Workers AI docs:** https://developers.cloudflare.com/workers-ai/

---

**Happy deploying! 🚀**
