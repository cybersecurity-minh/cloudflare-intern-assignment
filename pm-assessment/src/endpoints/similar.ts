import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types";
import { Feedback } from "../types";
import { findSimilar } from "../similarity";

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
									feedback_id: z.number(),
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

		try {
			// Use modular similarity function (easy to swap with Vectorize later)
			const similar = await findSimilar(db, id, 10);

			const result = { similar };

			// Cache result (30m TTL)
			await cache.put(cacheKey, JSON.stringify(result), { expirationTtl: 30 * 60 });

			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return c.json({ error: errorMessage }, 404);
		}
	}
}
