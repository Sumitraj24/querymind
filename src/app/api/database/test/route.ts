import { getAdapter, getSchema } from "@/lib/server/db";
import { handleError, rateLimit } from "@/lib/server/http";

/**
 * Test the server-configured database (DATABASE_URL) and refresh the cached schema.
 * Connection details are never accepted from or returned to the browser.
 */
export async function POST(req: Request) {
  try {
    rateLimit(req, "db-test", 10);
    const adapter = getAdapter();
    const result = await adapter.test();
    await getSchema(true);
    return Response.json({ mode: adapter.mode, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleError(err);
  }
}
