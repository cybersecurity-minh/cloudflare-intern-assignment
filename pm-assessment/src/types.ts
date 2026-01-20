import { DateTime, Str } from "chanfana";
import type { Context } from "hono";
import { z } from "zod";

export type AppContext = Context<{ Bindings: Env }>;

// Workers AI JSON schema (MUST MATCH SPEC.md)
export const AISentiment = z.object({
	label: z.enum(["positive", "neutral", "negative"]),
	confidence: z.number().min(0).max(1),
});

export const AITheme = z.object({
	theme: z.string(),
	impact_area: z.string(),
	evidence_quote: z.string(),
});

export const AIAnalysis = z.object({
	sentiment: AISentiment,
	urgency: z.object({
		score: z.number().int().min(0).max(100),
		reason: z.string(),
	}),
	themes: z.array(AITheme).min(1).max(4),
	summary: z.string(),
	next_action: z.string(),
});

// Database models
export const Feedback = z.object({
	id: z.number().int().optional(),
	source: Str({ example: "github" }),
	title: Str({ example: "API is slow" }),
	body: Str({ example: "The /api/users endpoint takes 5+ seconds to respond" }),
	created_at: DateTime({ required: false }),
	fingerprint: Str({ required: false }),
	analysis_status: z.enum(["pending", "processing", "completed", "failed"]).default("pending"),
});

export const Analysis = z.object({
	id: z.number().int().optional(),
	feedback_id: z.number().int(),
	sentiment_label: z.enum(["positive", "neutral", "negative"]).optional(),
	sentiment_confidence: z.number().optional(),
	urgency_score: z.number().int().optional(),
	urgency_reason: z.string().optional(),
	themes_json: z.string().optional(),
	summary: z.string().optional(),
	next_action: z.string().optional(),
	model: z.string().optional(),
	updated_at: DateTime({ required: false }),
	error: z.string().optional(),
});

// API request/response schemas
export const FeedbackCreateRequest = z.object({
	source: Str({ example: "github" }),
	title: Str({ example: "API is slow" }),
	body: Str({ example: "The /api/users endpoint takes 5+ seconds to respond" }),
});

export const FeedbackListQuery = z.object({
	source: Str({ required: false }),
	q: Str({ required: false }),
	limit: z.number().int().min(1).max(100).default(20).optional(),
	offset: z.number().int().min(0).default(0).optional(),
});
