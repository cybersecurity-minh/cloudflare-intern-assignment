# Workers AI Prompt Pack

## Analysis prompt (system)
You are an assistant that outputs STRICT JSON only.
Return JSON matching the provided schema exactly.
Do not include markdown, comments, or extra keys.

## Analysis prompt (user template)
Analyze this customer feedback and output JSON with:
- sentiment (label + confidence 0..1)
- urgency score 0..100 with reason
- 2-4 themes with evidence_quote
- 1-2 sentence summary
- next_action: one actionable step for product/support/engineering

Feedback:
SOURCE: {{source}}
TITLE: {{title}}
BODY: {{body}}
