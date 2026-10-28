import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Configure a fake FreeLLMAPI endpoint and use the built-in demo database (no DATABASE_URL).
beforeAll(() => {
  process.env.FREELLMAPI_BASE_URL = "http://llm.test/v1";
  process.env.FREELLMAPI_API_KEY = "freellmapi-test-key";
  process.env.FREELLMAPI_MODEL = "auto";
  delete process.env.DATABASE_URL;
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Mock the provider: each call returns the next queued completion (or a raw Response). */
function mockLlm(...replies: (string | Response)[]) {
  const calls: { url: string; auth: string | null; body: { model: string; messages: { role: string; content: string }[] } }[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body ?? "{}")) });
    const next = replies.shift();
    if (next instanceof Response) return next;
    return Response.json({ model: "test-model", choices: [{ message: { role: "assistant", content: next ?? "" } }] });
  }) as typeof fetch;
  return calls;
}

async function ask(body: unknown) {
  const { POST } = await import("@/app/api/ask/route");
  const res = await POST(new Request("http://app.test/api/ask", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` } }));
  return { status: res.status, body: await res.json(), headers: res.headers };
}

const sqlReply = (sql: string) => JSON.stringify({ sql, reason: "" });

describe("POST /api/ask", () => {
  it("answers with rows and column metadata, never SQL", async () => {
    const calls = mockLlm(sqlReply("SELECT first_name || ' ' || last_name AS employee, salary FROM employees ORDER BY salary DESC LIMIT 3"));
    const { status, body } = await ask({ question: "Show the top 3 employees with the highest salaries." });

    expect(status).toBe(200);
    expect(body.mode).toBe("demo");
    expect(body.columns).toEqual([
      { name: "employee", label: "Employee", kind: "text", currency: false },
      { name: "salary", label: "Salary", kind: "number", currency: true },
    ]);
    expect(body.rows).toEqual([
      ["Rahul Sharma", "90000.00"],
      ["Priya Iyer", "85000.00"],
      ["Amit Verma", "80000.00"],
    ]);
    expect(JSON.stringify(body)).not.toMatch(/SELECT|FROM employees/i);
    expect(body).not.toHaveProperty("sql");

    // The provider was called with the documented OpenAI-compatible request.
    expect(calls[0].url).toBe("http://llm.test/v1/chat/completions");
    expect(calls[0].auth).toBe("Bearer freellmapi-test-key");
    expect(calls[0].body.model).toBe("auto");
    expect(calls[0].body.messages[0].content).toContain("TABLE employees");
  });

  it("refuses write operations without executing them", async () => {
    mockLlm(sqlReply("DELETE FROM customers"));
    const { status, body } = await ask({ question: "Delete all customers" });
    expect(status).toBe(422);
    expect(body.error.code).toBe("read_only");
    expect(JSON.stringify(body)).not.toMatch(/DELETE FROM/i);
  });

  it("asks the model to repair a query that uses a missing column", async () => {
    const calls = mockLlm(
      sqlReply("SELECT name, dept_id FROM departments"),
      sqlReply("SELECT name, location FROM departments ORDER BY name"),
    );
    const { status, body } = await ask({ question: "List departments and their locations" });
    expect(status).toBe(200);
    expect(body.rowCount).toBe(6);
    expect(calls).toHaveLength(2);
    expect(calls[1].body.messages.at(-1)?.content).toMatch(/dept_id/);
  });

  it("repairs after a database error, without exposing the database message", async () => {
    mockLlm(sqlReply("SELECT name FROM departments WHERE id = 'abc'"), sqlReply("SELECT name FROM departments WHERE id = 1"));
    const { status, body } = await ask({ question: "Which department has id 1?" });
    expect(status).toBe(200);
    expect(body.rows).toEqual([["Engineering"]]);
  });

  it("returns an empty result set as rows: []", async () => {
    mockLlm(sqlReply("SELECT first_name FROM customers WHERE balance > 999999999"));
    const { status, body } = await ask({ question: "Customers with a balance over a billion" });
    expect(status).toBe(200);
    expect(body.rowCount).toBe(0);
    expect(body.rows).toEqual([]);
  });

  it("explains when the question can't be answered", async () => {
    mockLlm(JSON.stringify({ sql: "", reason: "No weather table" }));
    const { status, body } = await ask({ question: "What's the weather today?" });
    expect(status).toBe(422);
    expect(body.error.code).toBe("cannot_answer");
  });

  it("passes provider rate limits through with Retry-After", async () => {
    mockLlm(new Response("slow down", { status: 429, headers: { "retry-after": "12" } }));
    const { status, body, headers } = await ask({ question: "Count customers by city" });
    expect(status).toBe(429);
    expect(body.error).toMatchObject({ code: "rate_limited", retryAfterSeconds: 12 });
    expect(headers.get("retry-after")).toBe("12");
  });

  it("does not leak provider error bodies or keys", async () => {
    mockLlm(new Response('{"error":"invalid key freellmapi-test-key"}', { status: 401 }));
    const { status, body } = await ask({ question: "Count customers by city" });
    expect(status).toBe(502);
    expect(body.error.code).toBe("unauthorized");
    expect(JSON.stringify(body)).not.toContain("freellmapi-test-key");
  });

  it("reports an unreachable provider", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const { status, body } = await ask({ question: "Count customers by city" });
    expect(status).toBe(502);
    expect(body.error.code).toBe("unreachable");
  });

  it("validates the request body", async () => {
    mockLlm();
    expect((await ask({ question: "" })).status).toBe(400);
    expect((await ask({ question: "x".repeat(1001) })).status).toBe(400);
    expect((await ask({ question: "Valid question", model: "bad model; drop" })).status).toBe(400);
    expect((await ask({})).status).toBe(400);
  });
});
