import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types";
import { Feedback } from "../types";

export class Similar extends OpenAPIRoute {
	schema = {
		tags: ["Analysis"],
		summary: "Find similar feedback (Phase 1: theme-based)",
		request: {
			params: z.object({
				id: z.string(),
			}),
		},
		responses: {
			"200": {
				description: "Similar feedback items",
				content: {
					"application/json": {
						schema: z.object({
							similar: z.array(
								z.object({
									feedback: Feedback,
									similarity_score: z.number(),
									matching_themes: z.array(z.string()),
								})
							),
						}),
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

		// Check cache first
		const cacheKey = `similar:${id}`;
		const cached = await cache.get(cacheKey);
		if (cached) {
			return JSON.parse(cached);
		}

		// Get the source feedback's analysis
		const sourceAnalysis = await db
			.prepare("SELECT themes_json FROM analysis WHERE feedback_id = ?")
			.bind(id)
			.first<{ themes_json: string }>();

		if (!sourceAnalysis || !sourceAnalysis.themes_json) {
			return c.json({ error: "Feedback not found or not analyzed" }, 404);
		}

		const sourceThemes = JSON.parse(sourceAnalysis.themes_json);
		const sourceThemeSet = new Set(sourceThemes.map((t: { theme: string }) => t.theme.toLowerCase()));

		// Get all other analyzed feedback
		const allAnalysis = await db
			.prepare(
				`SELECT a.feedback_id, a.themes_json, f.*
				 FROM analysis a
				 JOIN feedback f ON a.feedback_id = f.id
				 WHERE a.feedback_id != ? AND a.themes_json IS NOT NULL
				 LIMIT 50`
			)
			.bind(id)
			.all<{ feedback_id: number; themes_json: string; [key: string]: any }>();

		// Calculate similarity based on theme overlap
		const similar = [];
		for (const row of allAnalysis.results || []) {
			try {
				const themes = JSON.parse(row.themes_json);
				const themeSet = new Set(themes.map((t: { theme: string }) => t.theme.toLowerCase()));

				// Calculate Jaccard similarity
				const intersection = new Set([...sourceThemeSet].filter((x) => themeSet.has(x)));
				const union = new Set([...sourceThemeSet, ...themeSet]);
				const similarity = intersection.size / union.size;

				if (similarity > 0) {
					const { themes_json, ...feedback } = row;
					similar.push({
						feedback,
						similarity_score: Math.round(similarity * 100) / 100,
						matching_themes: Array.from(intersection),
					});
				}
			} catch (e) {
				// Skip invalid JSON
			}
		}

		// Sort by similarity and take top 10
		similar.sort((a, b) => b.similarity_score - a.similarity_score);
		const result = { similar: similar.slice(0, 10) };

		// Cache result (30m TTL)
		await cache.put(cacheKey, JSON.stringify(result), { expirationTtl: 30 * 60 });

		return result;
	}
}
