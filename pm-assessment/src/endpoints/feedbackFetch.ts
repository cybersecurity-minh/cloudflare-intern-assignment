import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types";
import { Feedback, Analysis } from "../types";

export class FeedbackFetch extends OpenAPIRoute {
	schema = {
		tags: ["Feedback"],
		summary: "Get feedback by ID with optional analysis",
		request: {
			params: z.object({
				id: z.string(),
			}),
		},
		responses: {
			"200": {
				description: "Feedback details",
				content: {
					"application/json": {
						schema: z.object({
							feedback: Feedback,
							analysis: Analysis.optional(),
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

		const feedback = await db
			.prepare("SELECT * FROM feedback WHERE id = ?")
			.bind(id)
			.first();

		if (!feedback) {
			return c.json({ error: "Feedback not found" }, 404);
		}

		const analysis = await db
			.prepare("SELECT * FROM analysis WHERE feedback_id = ?")
			.bind(id)
			.first();

		return {
			feedback,
			analysis: analysis || undefined,
		};
	}
}
