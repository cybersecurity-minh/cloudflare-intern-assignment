# cloudflare-intern-assignment
PM Assignment

````md
Feedback Radar is a small public dashboard + API built on Cloudflare Workers that ingests customer feedback, runs AI analysis (sentiment/urgency/themes), and surfaces a digest + similar-feedback clustering.
**Demo:** `pm-assessment.cybersecurityminh.workers.dev`  
**API Docs:** `pm-assessment.cybersecurityminh.workers.dev/docs`

“The deployed demo is pre-seeded and pre-analyzed so it’s immediately interactive. Reviewers can optionally click ‘Seed Data’ to generate sample feedback.”!!!
---
## What it does (2-minute tour)
1) Open the dashboard (`/`)  
2) Click **Seed Data** (creates sample feedback across sources)  
3) Click a feedback item → click **Analyze**  
4) See analysis render (sentiment, urgency, themes, summary, next_action)  
5) Check **Digest** (24h / 7d) + **Similar** panel  
6) Open `/docs` to view the OpenAPI/Swagger documentation
---

## Cloudflare products used
- **Workers** (API + dashboard host)
- **D1** (persistent storage for feedback + analysis)
- **Workers KV** (cache for analysis/digest/similar)
- **Workers AI** (LLM analysis in JSON mode)
---

## Repo structure
- `pm-assessment/` — the deployed Worker app
  - `src/` — Worker code + dashboard
  - `migrations/` — D1 schema
  - `wrangler.jsonc` — bindings + build rules
  - `SMOKE_TESTS.md` — curl-based verification
  - `DEPLOY.md` — deploy/runbook
---
## Local development
> **Note:** Workers AI requires running in remote dev mode.
### 1) Install
```bash
cd pm-assessment
npm install
````
### 2) Apply D1 migrations (local)
```bash
npx wrangler d1 migrations apply feedback-radar-db --local
```
### 3) Run dev server
**UI-only / without AI**
```bash
npx wrangler dev
```
**Full functionality (Workers AI enabled)**
```bash
npx wrangler dev --remote
```
Open:
* [http://localhost:8787](http://localhost:8787)
---

## Quick verification (local)
```bash
export URL="http://localhost:8787"
# Seed
curl -X POST "$URL/api/seed"
# List feedback
curl "$URL/api/feedback"
# Analyze (requires --remote or deployed)
curl -X POST "$URL/api/analyze/1"
# Digest
curl "$URL/api/digest?window=24h"
# Similar (after analyzing 2+ items)
curl -X POST "$URL/api/analyze/2"
curl "$URL/api/similar/1"
```
Full suite: `pm-assessment/SMOKE_TESTS.md`
---

## Deploy (production)
```bash
cd pm-assessment
# Apply migrations to production D1
npx wrangler d1 migrations apply feedback-radar-db
# Deploy
npx wrangler deploy
```
After deploy, seed production data once:
```bash
export URL="https://YOUR_SUBDOMAIN.workers.dev"
curl -X POST "$URL/api/seed"
```
---

## Submission notes
* **Product insights / friction:** `docs/friction.md`
* **Deployment guide:** `pm-assessment/DEPLOY.md`
* **Smoke tests:** `pm-assessment/SMOKE_TESTS.md`
---
```
