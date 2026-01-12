import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext, FeedbackCreateRequest } from "../types";
import { Feedback } from "../types";

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

		// Generate fingerprint for deduplication using Web Crypto API
		const encoder = new TextEncoder();
		const data_to_hash = encoder.encode(`${source}:${title}:${body}`);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data_to_hash);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const fingerprint = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
			.substring(0, 16);

		// Insert with ON CONFLICT handling for duplicate fingerprints
		const result = await db
			.prepare(
				`INSERT INTO feedback (source, title, body, fingerprint, analysis_status, created_at)
				 VALUES (?, ?, ?, ?, 'pending', datetime('now'))
				 ON CONFLICT(fingerprint) DO UPDATE SET fingerprint = fingerprint
				 RETURNING *`
			)
			.bind(source, title, body, fingerprint)
			.first();

		return c.json(result, 201);
	}
}
