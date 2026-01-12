import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types";
import { AIAnalysis } from "../types";

export class Analyze extends OpenAPIRoute {
	schema = {
		tags: ["Analysis"],
		summary: "Analyze feedback using Workers AI",
		request: {
			params: z.object({
				id: z.string(),
			}),
		},
		responses: {
			"200": {
				description: "Analysis completed",
				content: {
					"application/json": {
						schema: AIAnalysis,
					},
				},
			},
			"404": {
				description: "Feedback not found",
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { id } = data.params;
		const db = c.env.DB;
		const cache = c.env.CACHE;
		const ai = c.env.AI;

		// Check cache first
		const cacheKey = `analysis:${id}`;
		const cached = await cache.get(cacheKey);
		if (cached) {
			return JSON.parse(cached);
		}

		// Get feedback
		const feedback = await db
			.prepare("SELECT * FROM feedback WHERE id = ?")
			.bind(id)
			.first<{ id: number; source: string; title: string; body: string }>();

		if (!feedback) {
			return c.json({ error: "Feedback not found" }, 404);
		}

		// Update status to processing
		await db
			.prepare("UPDATE feedback SET analysis_status = 'processing' WHERE id = ?")
			.bind(id)
			.run();

		try {
			// Call Workers AI with JSON mode
			const systemPrompt = `You are an assistant that outputs STRICT JSON only.
Return JSON matching the provided schema exactly.
Do not include markdown, comments, or extra keys.`;

			const userPrompt = `Analyze this customer feedback and output JSON with:
- sentiment (label + confidence 0..1)
- urgency score 0..100 with reason
- 2-4 themes with evidence_quote
- 1-2 sentence summary
- next_action: one actionable step for product/support/engineering

Feedback:
SOURCE: ${feedback.source}
TITLE: ${feedback.title}
BODY: ${feedback.body}`;

			const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userPrompt },
				],
				response_format: { type: "json_object" },
			});

			// Parse and validate AI response
			const aiResult = AIAnalysis.parse(response.response);

			// Store in D1
			await db
				.prepare(
					`INSERT INTO analysis (
						feedback_id, sentiment_label, sentiment_confidence,
						urgency_score, urgency_reason, themes_json,
						summary, next_action, model, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
					ON CONFLICT(feedback_id) DO UPDATE SET
						sentiment_label = excluded.sentiment_label,
						sentiment_confidence = excluded.sentiment_confidence,
						urgency_score = excluded.urgency_score,
						urgency_reason = excluded.urgency_reason,
						themes_json = excluded.themes_json,
						summary = excluded.summary,
						next_action = excluded.next_action,
						model = excluded.model,
						updated_at = datetime('now')`
				)
				.bind(
					id,
					aiResult.sentiment.label,
					aiResult.sentiment.confidence,
					aiResult.urgency.score,
					aiResult.urgency.reason,
					JSON.stringify(aiResult.themes),
					aiResult.summary,
					aiResult.next_action,
					"@cf/meta/llama-3.1-8b-instruct"
				)
				.run();

			// Update feedback status
			await db
				.prepare("UPDATE feedback SET analysis_status = 'completed' WHERE id = ?")
				.bind(id)
				.run();

			// Cache result (6h TTL)
			await cache.put(cacheKey, JSON.stringify(aiResult), { expirationTtl: 6 * 60 * 60 });

			return aiResult;
		} catch (error) {
			// Update status to failed and store error
			await db
				.prepare("UPDATE feedback SET analysis_status = 'failed' WHERE id = ?")
				.bind(id)
				.run();

			const errorMessage = error instanceof Error ? error.message : String(error);
			await db
				.prepare(
					`INSERT INTO analysis (feedback_id, error, updated_at)
					 VALUES (?, ?, datetime('now'))
					 ON CONFLICT(feedback_id) DO UPDATE SET error = excluded.error, updated_at = datetime('now')`
				)
				.bind(id, errorMessage)
				.run();

			return c.json(
				{
					error: "Analysis failed",
					message: errorMessage,
					feedback_id: id,
				},
				500
			);
		}
	}
}
