# Feedback Radar — Cloudflare Intern Assignment

## Goal
Ship a public dashboard + API on Cloudflare Workers using D1 + KV + Workers AI.
Prototype must work deployed. Mock data is fine.

## Non-negotiables
- Workers AI responses MUST be strict JSON matching @SPEC.md schema (use JSON Mode).
- Persist AI analysis in D1; cache in KV with TTL rules in @SPEC.md.
- Provide /api/similar/:id as a seam: Phase 1 theme-based, later Vectorize (no API shape changes).
- Every endpoint must have a curl smoke test (see @SPEC.md).

## Workflow rules
- Do not change API response shapes without updating @SPEC.md.
- Implement in small steps; after each step run smoke tests.
- Prefer wrangler.jsonc bindings generated/verified via Cloudflare Bindings MCP.

## References
@SPEC.md
@PROMPTS.md
@docs/FRICTION_LOG.md
