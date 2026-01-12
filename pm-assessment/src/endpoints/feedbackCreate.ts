import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext, FeedbackCreateRequest } from "../types";
import { Feedback } from "../types";
import { createHash } from "crypto";

export class FeedbackCreate extends OpenAPIRoute {
	schema = {
		tags: ["Feedback"],
		summary: "Submit new feedback",
		request: {
			body: {
				content: {
					"application/json": {
						schema: z.object({
							source: z.string(),
							title: z.string(),
							body: z.string(),
						}),
					},
				},
			},
		},
		responses: {
			"201": {
				description: "Feedback created successfully",
				content: {
					"application/json": {
						schema: Feedback,
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { source, title, body } = data.body;
		const db = c.env.DB;

		// Generate fingerprint for deduplication
		const fingerprint = createHash("sha256")
			.update(`${source}:${title}:${body}`)
			.digest("hex")
			.substring(0, 16);

		const result = await db
			.prepare(
				`INSERT INTO feedback (source, title, body, fingerprint, analysis_status, created_at)
				 VALUES (?, ?, ?, ?, 'pending', datetime('now'))
				 RETURNING *`
			)
			.bind(source, title, body, fingerprint)
			.first();

		return c.json(result, 201);
	}
}
