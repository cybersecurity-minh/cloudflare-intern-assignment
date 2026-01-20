import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types";

export class Digest extends OpenAPIRoute {
	schema = {
		tags: ["Analysis"],
		summary: "Get analysis digest for a time window",
		request: {
			query: z.object({
				window: z.enum(["24h", "7d"]).default("24h"),
			}),
		},
		responses: {
			"200": {
				description: "Analysis digest",
				content: {
					"application/json": {
						schema: z.object({
							window: z.string(),
							total_feedback: z.number(),
							sentiment_breakdown: z.object({
								positive: z.number(),
								neutral: z.number(),
								negative: z.number(),
							}),
							avg_urgency: z.number(),
							top_themes: z.array(
								z.object({
									theme: z.string(),
									count: z.number(),
								})
							),
							sources: z.array(
								z.object({
									source: z.string(),
									count: z.number(),
								})
							),
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { window = "24h" } = data.query;
		const db = c.env.DB;
		const cache = c.env.CACHE;

		// Check cache first
		const cacheKey = `digest:${window}`;
		const cached = await cache.get(cacheKey);
		if (cached) {
			return JSON.parse(cached);
		}

		// Calculate time window
		const hours = window === "24h" ? 24 : 7 * 24;
		const cutoff = `datetime('now', '-${hours} hours')`;

		// Get total feedback count
		const totalResult = await db
			.prepare(`SELECT COUNT(*) as count FROM feedback WHERE created_at >= ${cutoff}`)
			.first<{ count: number }>();

		const totalFeedback = totalResult?.count || 0;

		// Get sentiment breakdown
		const sentimentResult = await db
			.prepare(
				`SELECT sentiment_label, COUNT(*) as count
				 FROM analysis a
				 JOIN feedback f ON a.feedback_id = f.id
				 WHERE f.created_at >= ${cutoff}
				 GROUP BY sentiment_label`
			)
			.all<{ sentiment_label: string; count: number }>();

		const sentimentBreakdown = {
			positive: 0,
			neutral: 0,
			negative: 0,
		};

		for (const row of sentimentResult.results || []) {
			if (row.sentiment_label === "positive") sentimentBreakdown.positive = row.count;
			if (row.sentiment_label === "neutral") sentimentBreakdown.neutral = row.count;
			if (row.sentiment_label === "negative") sentimentBreakdown.negative = row.count;
		}

		// Get average urgency
		const urgencyResult = await db
			.prepare(
				`SELECT AVG(urgency_score) as avg_urgency
				 FROM analysis a
				 JOIN feedback f ON a.feedback_id = f.id
				 WHERE f.created_at >= ${cutoff}`
			)
			.first<{ avg_urgency: number }>();

		const avgUrgency = Math.round(urgencyResult?.avg_urgency || 0);

		// Get top themes (extract from themes_json)
		const themesResult = await db
			.prepare(
				`SELECT themes_json
				 FROM analysis a
				 JOIN feedback f ON a.feedback_id = f.id
				 WHERE f.created_at >= ${cutoff} AND themes_json IS NOT NULL`
			)
			.all<{ themes_json: string }>();

		const themeCounts: Record<string, number> = {};
		for (const row of themesResult.results || []) {
			try {
				const themes = JSON.parse(row.themes_json);
				for (const theme of themes) {
					themeCounts[theme.theme] = (themeCounts[theme.theme] || 0) + 1;
				}
			} catch (e) {
				// Skip invalid JSON
			}
		}

		const topThemes = Object.entries(themeCounts)
			.map(([theme, count]) => ({ theme, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 5);

		// Get source breakdown
		const sourcesResult = await db
			.prepare(
				`SELECT source, COUNT(*) as count
				 FROM feedback
				 WHERE created_at >= ${cutoff}
				 GROUP BY source`
			)
			.all<{ source: string; count: number }>();

		const sources = (sourcesResult.results || []).map((row) => ({
			source: row.source,
			count: row.count,
		}));

		const digest = {
			window,
			total_feedback: totalFeedback,
			sentiment_breakdown: sentimentBreakdown,
			avg_urgency: avgUrgency,
			top_themes: topThemes,
			sources,
		};

		// Cache result (10m TTL)
		await cache.put(cacheKey, JSON.stringify(digest), { expirationTtl: 10 * 60 });

		return digest;
	}
}
