/**
 * Similarity Module
 * Phase 1: Theme-based Jaccard similarity
 * Phase 2: Replace with Vectorize embeddings (keep same interface)
 */

export interface SimilarityResult {
	feedback_id: number;
	similarity_score: number;
	matching_themes: string[];
	[key: string]: any;
}

export interface Theme {
	theme: string;
	impact_area: string;
	evidence_quote: string;
}

/**
 * Calculate similarity between feedback items based on themes
 * Phase 1: Jaccard similarity on theme overlap
 * Phase 2: Can be replaced with Vectorize embeddings
 */
export async function calculateSimilarity(
	sourceThemes: Theme[],
	candidateThemes: Theme[],
	candidateFeedback: any
): Promise<SimilarityResult | null> {
	// Phase 1: Theme-based Jaccard similarity
	const sourceThemeSet = new Set(sourceThemes.map((t) => t.theme.toLowerCase()));
	const candidateThemeSet = new Set(candidateThemes.map((t) => t.theme.toLowerCase()));

	// Calculate Jaccard similarity: intersection / union
	const intersection = new Set([...sourceThemeSet].filter((x) => candidateThemeSet.has(x)));
	const union = new Set([...sourceThemeSet, ...candidateThemeSet]);

	if (intersection.size === 0) {
		return null; // No similarity
	}

	const similarity = intersection.size / union.size;

	return {
		feedback_id: candidateFeedback.id,
		similarity_score: Math.round(similarity * 100) / 100,
		matching_themes: Array.from(intersection),
		...candidateFeedback,
	};
}

/**
 * Find similar feedback items
 * This function signature remains stable when migrating to Vectorize
 */
export async function findSimilar(
	db: D1Database,
	feedbackId: string | number,
	limit: number = 10
): Promise<SimilarityResult[]> {
	// Get source feedback's analysis
	const sourceAnalysis = await db
		.prepare("SELECT themes_json FROM analysis WHERE feedback_id = ?")
		.bind(feedbackId)
		.first<{ themes_json: string }>();

	if (!sourceAnalysis || !sourceAnalysis.themes_json) {
		throw new Error("Feedback not found or not analyzed");
	}

	const sourceThemes: Theme[] = JSON.parse(sourceAnalysis.themes_json);

	// Get all other analyzed feedback
	const allAnalysis = await db
		.prepare(
			`SELECT a.feedback_id, a.themes_json, f.*
			 FROM analysis a
			 JOIN feedback f ON a.feedback_id = f.id
			 WHERE a.feedback_id != ? AND a.themes_json IS NOT NULL
			 LIMIT 50`
		)
		.bind(feedbackId)
		.all<{ feedback_id: number; themes_json: string; [key: string]: any }>();

	// Calculate similarity for each candidate
	const results: SimilarityResult[] = [];
	for (const row of allAnalysis.results || []) {
		try {
			const candidateThemes: Theme[] = JSON.parse(row.themes_json);
			const { themes_json, ...feedback } = row;

			const result = await calculateSimilarity(sourceThemes, candidateThemes, feedback);
			if (result) {
				results.push(result);
			}
		} catch (e) {
			// Skip invalid JSON
			continue;
		}
	}

	// Sort by similarity score (descending) and return top N
	results.sort((a, b) => b.similarity_score - a.similarity_score);
	return results.slice(0, limit);
}

/**
 * Future: Vectorize-based similarity (Phase 2)
 *
 * export async function findSimilarVectorize(
 *   db: D1Database,
 *   vectorize: Vectorize,
 *   feedbackId: string | number,
 *   limit: number = 10
 * ): Promise<SimilarityResult[]> {
 *   // 1. Get feedback text
 *   const feedback = await db.prepare("SELECT * FROM feedback WHERE id = ?").bind(feedbackId).first();
 *
 *   // 2. Generate embedding
 *   const embedding = await vectorize.embed(feedback.title + " " + feedback.body);
 *
 *   // 3. Query vector index
 *   const matches = await vectorize.query(embedding, { topK: limit });
 *
 *   // 4. Fetch full feedback details
 *   return matches.map(m => ({ ...m.metadata, similarity_score: m.score }));
 * }
 */
