import { fromHono } from "chanfana";
import { Hono } from "hono";
import { Seed } from "./endpoints/seed";
import { FeedbackCreate } from "./endpoints/feedbackCreate";
import { FeedbackList } from "./endpoints/feedbackList";
import { FeedbackFetch } from "./endpoints/feedbackFetch";
import { Analyze } from "./endpoints/analyze";
import { Digest } from "./endpoints/digest";
import { Similar } from "./endpoints/similar";
import dashboardHtml from "./dashboard.html";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Setup OpenAPI registry (docs moved to /docs)
const openapi = fromHono(app, {
	docs_url: "/docs",
});

// Serve dashboard at root
app.get("/", (c) => {
	return c.html(dashboardHtml);
});

// Register SPEC endpoints
openapi.post("/api/seed", Seed);
openapi.post("/api/feedback", FeedbackCreate);
openapi.get("/api/feedback", FeedbackList);
openapi.get("/api/feedback/:id", FeedbackFetch);
openapi.post("/api/analyze/:id", Analyze);
openapi.get("/api/digest", Digest);
openapi.get("/api/similar/:id", Similar);

// Export the Hono app
export default app;
