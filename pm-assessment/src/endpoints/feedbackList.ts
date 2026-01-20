import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types";
import { Feedback } from "../types";

export class FeedbackList extends OpenAPIRoute {
	schema = {
		tags: ["Feedback"],
		summary: "List feedback with optional filters",
		request: {
			query: z.object({
				source: z.string().optional(),
				q: z.string().optional(),
				limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
				offset: z.coerce.number().int().min(0).default(0).optional(),
			}),
		},
		responses: {
			"200": {
				description: "List of feedback",
				content: {
					"application/json": {
						schema: z.object({
							data: z.array(Feedback),
							total: z.number(),
							limit: z.number(),
							offset: z.number(),
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { source, q, limit = 20, offset = 0 } = data.query;
		const db = c.env.DB;

		const limitNum = limit;
		const offsetNum = offset;

		let query = "SELECT f.*, a.sentiment_label FROM feedback f LEFT JOIN analysis a ON f.id = a.feedback_id WHERE 1=1";
		const bindings: (string | number)[] = [];

		if (source) {
			query += " AND f.source = ?";
			bindings.push(source);
		}

		if (q) {
			query += " AND (f.title LIKE ? OR f.body LIKE ?)";
			const searchTerm = `%${q}%`;
			bindings.push(searchTerm, searchTerm);
		}

		// Get total count
		const countQuery = query.replace("SELECT f.*, a.sentiment_label", "SELECT COUNT(*) as count");
		const countResult = await db.prepare(countQuery).bind(...bindings).first<{ count: number }>();
		const total = countResult?.count || 0;

		// Get paginated results
		query += " ORDER BY f.created_at DESC LIMIT ? OFFSET ?";
		bindings.push(limitNum, offsetNum);

		const results = await db.prepare(query).bind(...bindings).all();

		return {
			data: results.results || [],
			total,
			limit: limitNum,
			offset: offsetNum,
		};
	}
}
