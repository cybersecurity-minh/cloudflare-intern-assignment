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
			query: z.object({
				force: z.string().optional().transform((val) => val === "true" || val === "1"),
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
		const force = data.query.force;
		const db = c.env.DB;
		const cache = c.env.CACHE;
		const ai = c.env.AI;

		// Check cache first (skip if force=true)
		const cacheKey = `analysis:${id}`;
		if (!force) {
			const cached = await cache.get(cacheKey);
			if (cached) {
				return JSON.parse(cached);
			}
		} else {
			// Clear existing cache for re-analysis
			await cache.delete(cacheKey);
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

			// JSON Schema for structured output
			const analysisSchema = {
				type: "object",
				properties: {
					sentiment: {
						type: "object",
						properties: {
							label: { type: "string", enum: ["positive", "neutral", "negative"] },
							confidence: { type: "number", minimum: 0, maximum: 1 },
						},
						required: ["label", "confidence"],
					},
					urgency: {
						type: "object",
						properties: {
							score: { type: "integer", minimum: 0, maximum: 100 },
							reason: { type: "string" },
						},
						required: ["score", "reason"],
					},
					themes: {
						type: "array",
						minItems: 1,
						maxItems: 4,
						items: {
							type: "object",
							properties: {
								theme: { type: "string" },
								impact_area: { type: "string" },
								evidence_quote: { type: "string" },
							},
							required: ["theme", "impact_area", "evidence_quote"],
						},
					},
					summary: { type: "string" },
					next_action: { type: "string" },
				},
				required: ["sentiment", "urgency", "themes", "summary", "next_action"],
			};

			// Helper function to call AI
			const callAI = async () => {
				return ai.run("@cf/meta/llama-3.1-8b-instruct", {
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: userPrompt },
					],
					response_format: {
						type: "json_schema",
						json_schema: {
							name: "feedback_analysis",
							schema: analysisSchema,
							strict: true,
						},
					},
				});
			};

			// Helper function to parse AI response
			const parseResponse = (response: any) => {
				const rawResponse = response.response;
				// Handle both string and object responses
				const jsonData = typeof rawResponse === "string" ? JSON.parse(rawResponse) : rawResponse;
				return AIAnalysis.parse(jsonData);
			};

			// Try AI call with retry guard on parse failure
			let aiResult;
			let response = await callAI();

			try {
				aiResult = parseResponse(response);
			} catch (parseError) {
				// Retry once on parse failure
				console.log("First parse failed, retrying AI call...", parseError);
				response = await callAI();
				aiResult = parseResponse(response); // Throws if still fails
			}

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
