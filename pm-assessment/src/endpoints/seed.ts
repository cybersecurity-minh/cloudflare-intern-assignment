import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../types";

export class Seed extends OpenAPIRoute {
	schema = {
		tags: ["Feedback"],
		summary: "Seed database with sample feedback",
		responses: {
			"200": {
				description: "Database seeded successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: z.boolean(),
							inserted: z.number(),
							message: z.string(),
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		const db = c.env.DB;

		const sampleFeedback = [
			{
				source: "github",
				title: "API response time is too slow",
				body: "The /api/users endpoint takes 5+ seconds to respond. This is causing timeouts in our mobile app. We need better performance.",
				fingerprint: "github-issue-001",
			},
			{
				source: "slack",
				title: "Love the new dashboard!",
				body: "The new dashboard UI is amazing. The real-time updates are exactly what we needed. Great work team!",
				fingerprint: "slack-msg-002",
			},
			{
				source: "email",
				title: "Bug in export feature",
				body: "When I try to export data to CSV, the file is corrupted and won't open in Excel. This is blocking our quarterly reporting.",
				fingerprint: "email-ticket-003",
			},
			{
				source: "github",
				title: "Feature request: Dark mode",
				body: "It would be great to have a dark mode option. Working late at night, the bright UI strains my eyes.",
				fingerprint: "github-issue-004",
			},
			{
				source: "intercom",
				title: "Cannot reset password",
				body: "I've tried resetting my password 3 times but never receive the email. Checked spam folder too. Please help urgently!",
				fingerprint: "intercom-chat-005",
			},
		];

		let inserted = 0;
		for (const feedback of sampleFeedback) {
			try {
				const result = await db
					.prepare(
						`INSERT INTO feedback (source, title, body, fingerprint, analysis_status)
						 VALUES (?, ?, ?, ?, 'pending')
						 ON CONFLICT(fingerprint) DO NOTHING`
					)
					.bind(feedback.source, feedback.title, feedback.body, feedback.fingerprint)
					.run();

				// Only count if a row was actually inserted (not skipped due to conflict)
				if (result.meta.changes > 0) {
					inserted++;
				}
			} catch (error) {
				console.error("Error inserting feedback:", error);
			}
		}

		return {
			success: true,
			inserted,
			message: `Seeded ${inserted} sample feedback items`,
		};
	}
}
