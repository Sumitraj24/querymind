import { z } from "zod";
import { answerQuestion, MAX_QUESTION_LENGTH } from "@/lib/server/ask";
import { handleError, rateLimit, readBody } from "@/lib/server/http";

const bodySchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, "Please type a question.")
    .max(MAX_QUESTION_LENGTH, `Questions can be up to ${MAX_QUESTION_LENGTH} characters.`),
  model: z
    .string()
    .trim()
    .max(120)
    .regex(/^[\w.:/@+-]*$/, "Invalid model name.")
    .optional(),
  rowLimit: z.number().int().min(1).max(5000).optional(),
});

/**
 * Answer an English question with data. The generated SQL never leaves the server:
 * the response contains only column metadata, rows and plain-language notices.
 */
export async function POST(req: Request) {
  try {
    rateLimit(req, "ask", 20);
    const body = await readBody(req, bodySchema);
    const result = await answerQuestion(body.question, { model: body.model || undefined, rowLimit: body.rowLimit });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleError(err);
  }
}
