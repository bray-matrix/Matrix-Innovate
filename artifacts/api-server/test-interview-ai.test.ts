import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformClient, PlatformServiceError } from "@workspace/matrix-sdk";
import interviewRouter, { advanceInterview, buildInterviewMessages, inputSchema, safePlatformErrorMetadata } from "./src/routes/interview-ai";

type Input = Parameters<typeof advanceInterview>[0];
const make = (answers: string[], jira: Input["jira"] = null): Input => ({
  turns: answers.map((answer, i) => ({ question: `What matters at step ${i + 1}?`, answer })),
  jira,
});
const output = (input: Input, question = "What business outcome would show improvement?", complete = false) => ({
  knownFacts: input.turns[0].answer ? [{
    category: "problem", value: input.turns[0].answer, evidence: input.turns[0].answer, source: "user",
  }] : [],
  inferredSuggestions: ["This may improve customer experience"],
  unknowns: ["Exact value not yet quantified"],
  nextQuestion: complete ? "" : question,
  interviewComplete: complete,
  suggestedInitiativeType: "Operations",
  suggestedTitle: "Improve Request Visibility",
  draft: { problemStatement: input.turns[0].answer, currentProcess: "",
    desiredOutcome: "", expectedValue: "Value not yet quantified",
    successMetric: "", risks: "" },
});
const success = (data: unknown) => async () => ({ data });

test("A: vague Sales idea stays open with a business question and separates suggestions", async () => {
  const input = make(["We should make it easier for clients to know where their jobs are."]);
  const result = await advanceInterview(input, success(output(input, "What do clients do today to find out their job status?")));
  assert.equal(result?.interviewComplete, false);
  assert.match(result!.nextQuestion, /clients.*today/i);
  assert.equal(result!.knownFacts[0].value, input.turns[0].answer);
  assert.notEqual(result!.inferredSuggestions[0], result!.knownFacts[0].value);
});

test("B/J: multi-fact first response remains intact; next question does not repeat supplied facts", async () => {
  const input = make(["Operations receives 80 orders weekly by email, copies details to spreadsheets, and wants fewer handoff errors."]);
  const result = await advanceInterview(input, success(output(input, "How would you measure fewer handoff errors?")));
  assert.match(buildInterviewMessages(input)![0].content, /80 orders weekly.*spreadsheets.*handoff errors/);
  assert.doesNotMatch(result!.nextQuestion, /how often|what process|who receives/i);
});

test("C: Jira summary and description preserved, correct source only, no Jira write", async () => {
  const jira = { summary: "Reduce onboarding delays", description: "Operations manually assigns new requests." };
  const input = make(["We want faster client responses."], jira);
  const fact = { category: "current process", value: jira.description, evidence: jira.description, source: "jira" };
  const result = await advanceInterview(input, async request => {
    assert.equal(request.messages.length, 2);
    assert.match(request.messages[0].content, /Reduce onboarding delays/);
    assert.match(request.messages[0].content, /Operations manually assigns/);
    assert.equal(request.feature, "guided-interview-v2");
    return { data: { ...output(input, "What delays the assignments?"), knownFacts: [fact] } };
  });
  assert.equal(result?.knownFacts[0].source, "jira");
  const withoutJira = await advanceInterview(make(["Different answer"]), success({ ...output(input), knownFacts: [fact] }));
  assert.deepEqual(withoutJira?.knownFacts, [], "Jira claims cannot survive without Jira evidence");
});

test("D: repeated skip is transmitted as unknown verbatim, never converted into known fact", async () => {
  const input = make(["A problem exists", "", "", "Not known yet"]);
  const result = await advanceInterview(input, async request => {
    assert.equal(request.messages.length, 4);
    assert.equal(JSON.parse(request.messages[1].content).answer, "");
    assert.equal(JSON.parse(request.messages[2].content).answer, "");
    return { data: { ...output(input, "", true), unknowns: ["Volume unknown"] } };
  });
  assert.equal(result?.interviewComplete, true);
  assert.equal(result?.knownFacts.length, 1);
});

test("E: service outage immediately falls back; no replay", async () => {
  let count = 0;
  await assert.rejects(advanceInterview(make(["An idea"]), async () => {
    count++; throw new PlatformServiceError("unavailable");
  }), (error: unknown) => error instanceof PlatformServiceError && error.code === "unavailable");
  assert.equal(count, 1);
});

test("F: malformed output and SDK invalid_response each retry once, then fall back", async () => {
  const input = make(["An idea"]);
  for (const malformed of [async () => ({ data: { unexpected: true } }), async (): Promise<{ data: unknown }> => {
    throw new PlatformServiceError("invalid_response");
  }]) {
    let calls = 0;
    const invalid: number[] = [];
    assert.equal(await advanceInterview(input, async () => { calls++; return malformed(); }, n => invalid.push(n)), null);
    assert.equal(calls, 2);
    assert.deepEqual(invalid, [1, 2]);
  }
  let calls = 0;
  assert.ok(await advanceInterview(input, async () => {
    calls++;
    if (calls === 1) throw new PlatformServiceError("invalid_response");
    return { data: output(input) };
  }));
  assert.equal(calls, 2);
});

test("G: completion may occur early, but complete output cannot carry a question", async () => {
  const input = make(["A thorough, clear idea"]);
  assert.equal((await advanceInterview(input, success(output(input, "", true))))?.interviewComplete, true);
  assert.equal(await advanceInterview(input, success({ ...output(input, "", true), nextQuestion: "A redundant question?" })), null);
  assert.equal(await advanceInterview(input, success({ ...output(input, "", true), nextQuestion: " " })), null);
  assert.equal(await advanceInterview(input, success({ ...output(input), nextQuestion: " ", interviewComplete: false })), null);
});

test("H: complex idea can continue past eight questions, but 12 must complete", async () => {
  const nine = make(Array.from({ length: 9 }, (_, i) => `Concern ${i + 1}`));
  assert.equal((await advanceInterview(nine, success(output(nine))))?.interviewComplete, false);
  const twelve = make(Array.from({ length: 12 }, (_, i) => `Concern ${i + 1}`));
  assert.equal(await advanceInterview(twelve, success(output(twelve))), null);
  assert.equal((await advanceInterview(twelve, success(output(twelve, "", true))))?.interviewComplete, true);
});

test("I: qualitative frequency from real regression transcript is retained, volume remains unknown", async () => {
  const input = make([
    "We spend too much time manually handling client requests that come in through email. I think there should be a better way to track and route them.",
    "Client requests usually come directly to our account managers by email. They forward them to different people in operations depending on what the client needs. There isn't really one place to see all open requests, who owns them, or whether they were completed. It affects Account Management, Operations, and ultimately the client.",
    "Account managers have to read each request, figure out who should handle it, forward it to the right person, and then manually follow up to find out whether it was completed. Operations may also have to ask questions back through the account manager. We don't know exactly how much time this consumes, but with the number of clients we have it happens constantly.",
  ]);
  const result = await advanceInterview(input, async request => {
    assert.equal(request.messages.length, 3);
    assert.match(request.messages[2].content, /happens constantly/);
    assert.ok(request.instruction.includes("qualitative frequency IS frequency"));
    assert.doesNotMatch(request.instruction, /account managers|client requests|happens constantly/i,
      "the scenario belongs in the transcript, not hardcoded instructions");
    return { data: { ...output(input, "Roughly how many requests arrive in a typical week?"),
      knownFacts: [{ category: "frequency", value: "happens constantly", evidence: "happens constantly", source: "user" }] } };
  });
  assert.doesNotMatch(result!.nextQuestion, /how often/i);
  assert.equal(result!.knownFacts[0].value, "happens constantly");
});

test("provenance: unsupported and misattributed facts are removed; paraphrases use exact evidence", async () => {
  const input = make(["Manual handoffs are slow."], { summary: "Jira intake", description: "" });
  const facts = [
    { category: "problem", value: "Saves $5 million", evidence: "Manual handoffs", source: "user" },
    { category: "problem", value: "Manual handoffs", evidence: "Manual handoffs", source: "jira" },
    { category: "problem", value: "Slow handoffs", evidence: "Manual handoffs", source: "user" },
  ];
  const result = await advanceInterview(input, success({ ...output(input), knownFacts: facts }));
  assert.deepEqual(result?.knownFacts.map(f => [f.value, f.source]), [
    ["Manual handoffs", "user"], ["Manual handoffs", "user"],
  ]);
  assert.doesNotMatch(JSON.stringify(result), /Saves \$5 million|Slow handoffs/);
  const invented = output(input);
  invented.draft.expectedValue = "Saves $5 million per year";
  invented.draft.risks = "Requires 20% more staff";
  invented.inferredSuggestions = ["Perhaps $5 million in savings", "This may improve customer experience"];
  invented.suggestedTitle = "$5 million request improvements";
  const sanitized = await advanceInterview(input, success(invented));
  assert.equal(sanitized?.draft.expectedValue, "Value not yet quantified");
  assert.equal(sanitized?.draft.risks, "");
  assert.deepEqual(sanitized?.inferredSuggestions, ["This may improve customer experience"]);
  assert.equal(sanitized?.suggestedTitle, "");
  assert.equal(await advanceInterview(input, success({ ...output(input), nextQuestion: "Do you have $5 million available?" })), null);
});

test("each message <=8000, full accepted transcript retained, total <=24000, excess explicitly rejected", () => {
  const input = make(Array.from({ length: 12 }, (_, i) => String(i).repeat(1000)),
    { summary: "s".repeat(500), description: "d".repeat(4000) });
  input.turns.forEach((turn, i) => { turn.question = `Q${i}`.padEnd(600, "q"); });
  const messages = buildInterviewMessages(input);
  if (messages) {
    assert.equal(messages.length, 13);
    assert.ok(messages.every(m => m.content.length <= 8000));
    input.turns.forEach((turn, i) => assert.equal(JSON.parse(messages[i + 1].content).answer, turn.answer));
  } else {
    assert.equal(messages, null, "oversize input is rejected rather than silently truncated");
  }
  const accepted = make(Array.from({ length: 12 }, (_, i) => String(i % 10).repeat(900)));
  const all = buildInterviewMessages(accepted)!;
  assert.equal(all.length, 12);
  assert.ok(all.every((m, i) => JSON.parse(m.content).answer === accepted.turns[i].answer));
  assert.ok(inputSchema.safeParse(accepted).success);
  assert.equal(inputSchema.safeParse({ ...accepted, turns: accepted.turns.concat(accepted.turns[0]) }).success, false);
});

test("route refuses malformed and over-budget context before Platform inference", async () => {
  const route = (interviewRouter as any).stack.find((layer: any) => layer.route?.path === "/interview/advance");
  const post = async (body: unknown): Promise<{ status: number; body: any }> => new Promise((resolve, reject) => {
    let status = 200;
    const res = { status(value: number) { status = value; return this; },
      json(value: unknown) { resolve({ status, body: value }); return this; } };
    Promise.resolve(route.route.stack[0].handle({ body, log: { warn() {}, info() {} } }, res, reject)).catch(reject);
  });
  assert.equal((await post({ turns: [], jira: null })).status, 400);
  const overBudget = make(Array.from({ length: 12 }, () => "a".repeat(1000)),
    { summary: "b".repeat(500), description: "c".repeat(4000) });
  overBudget.turns.forEach(t => { t.question = "q".repeat(600); });
  assert.equal(buildInterviewMessages(overBudget), null);
  assert.equal((await post(overBudget)).status, 400);
});

test("production regression A/B: bounded fact evidence/value is normalized without truncating assertions", async () => {
  const quote = "A".repeat(400);
  const input = make([`${quote} Further detail.`]);
  const result = await advanceInterview(input, success({
    ...output(input), knownFacts: [
      { category: "problem", evidence: `  ${quote}  `, value: `  ${quote}  `, source: "user" },
      { category: "impact", evidence: `${quote} Further detail.`, value: `${quote} Further detail.`, source: "user" },
    ],
  }));
  assert.equal(result?.knownFacts.length, 1, "oversized optional quote is dropped, not cut mid-claim");
  assert.equal(result?.knownFacts[0].evidence, quote);
  assert.equal(result?.knownFacts[0].value, quote);
  const largeValue = await advanceInterview(input, success({
    ...output(input), knownFacts: [
      { category: "problem", evidence: quote, value: "X".repeat(701), source: "user" },
    ],
  }));
  assert.deepEqual(largeValue?.knownFacts, [], "oversized value cannot leak into known facts");
  const boundary = await advanceInterview(input, success({
    ...output(input), knownFacts: [
      { category: "problem", evidence: quote, value: quote, source: "user" },
    ],
  }));
  assert.equal(boundary?.knownFacts[0].evidence.length, 400);
});

test("production regression B: oversized optional collections and prose cannot rewrite or persist claims", async () => {
  const input = make(["Manual handoffs cause delays."]);
  const raw = output(input);
  raw.inferredSuggestions = [...Array.from({ length: 13 }, () => "Consider routing improvements"), "X".repeat(501)];
  raw.unknowns = [...Array.from({ length: 16 }, () => "Impact unknown"), "X".repeat(201)];
  raw.draft.problemStatement = `${"Manual handoffs cause delays. ".repeat(110)}but there is no delay.`;
  const result = await advanceInterview(input, success(raw));
  assert.equal(result?.inferredSuggestions.length, 12);
  assert.equal(result?.unknowns.length, 15);
  assert.equal(result?.draft.problemStatement, "", "a truncated prefix would misstate the assertion");
});

test("production regression C/D/E: invalid types are rejected; retry carries specific constraint and recovers", async () => {
  const input = make(["Manual handoffs cause delays."]);
  const invalid = { ...output(input), nextQuestion: "What effect does this have?".repeat(30) };
  let calls = 0;
  const failures: { path?: string; constraint?: string; retry?: boolean }[] = [];
  const recovered = await advanceInterview(input, async request => {
    calls++;
    if (calls === 2) {
      assert.match(request.instruction, /nextQuestion \(too_big:string:600\)/);
      assert.ok(request.instruction.length + request.messages.reduce((n, m) => n + m.content.length, 0) <= 24000);
    }
    return { data: calls === 1 ? invalid : output(input) };
  }, (_attempt, _category, details) => { failures.push(details ?? {}); });
  assert.equal(calls, 2);
  assert.equal(recovered?.nextQuestion, output(input).nextQuestion);
  assert.deepEqual(failures, [{ path: "nextQuestion", constraint: "too_big:string:600", retry: true }].map(
    expected => ({ ...expected, durationMs: failures[0].durationMs })));

  calls = 0;
  const malformed = { ...output(input), knownFacts: [{ category: "problem", evidence: 123, value: "claim", source: "user" }] };
  assert.equal(await advanceInterview(input, async request => {
    calls++;
    if (calls === 2) assert.match(request.instruction, /knownFacts\[0\]\.evidence \(invalid_type\)/);
    return { data: malformed };
  }), null);
  assert.equal(calls, 2);
});

test("production regression F: repeated local validation failure has exactly one feedback retry then fallback", async () => {
  const input = make(["Manual handoffs cause delays."]);
  let calls = 0;
  const retry: boolean[] = [];
  const invalid = { ...output(input), knownFacts: [{ category: "problem", evidence: false, value: "claim", source: "user" }] };
  const result = await advanceInterview(input, async request => {
    calls++;
    if (calls === 2) assert.match(request.instruction, /knownFacts\[0\]\.evidence \(invalid_type\)/);
    return { data: invalid };
  }, (_attempt, _category, details) => retry.push(details!.retry));
  assert.equal(result, null);
  assert.equal(calls, 2);
  assert.deepEqual(retry, [true, false]);
});

test("K: instruction prefers one primary question without making the interview rigid", async () => {
  const input = make(["We need a better process."]);
  await advanceInterview(input, async request => {
    assert.match(request.instruction, /one primary ask per turn/i);
    assert.match(request.instruction, /do not stack independent questions/i);
    assert.match(request.instruction, /natural and adaptive/i);
    return { data: output(input) };
  });
});

test("SDK AI transport survives >10 seconds and returns Platform request correlation", async () => {
  const input = make(["Manual intake causes delays."]);
  let aiCalls = 0;
  let requestId: string | undefined;
  const client = createPlatformClient({
    platformUrl: "https://platform.example",
    applicationId: "test-app",
    applicationSecret: "test-secret",
    fetch: async (url, init) => {
      if (String(url).endsWith("/api/bridge/login")) {
        return Response.json({ ok: true, token: `mxt_${"a".repeat(24)}`,
          expiresAt: new Date(Date.now() + 3600_000).toISOString() });
      }
      aiCalls++;
      requestId = new Headers(init?.headers).get("X-Request-ID") ?? undefined;
      assert.match(requestId!, /^[0-9a-f-]{36}$/);
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.redirect, "error");
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 10_050);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("transport aborted"));
        }, { once: true });
      });
      return Response.json({ data: output(input), requestId, provider: "test",
        model: "test", durationMs: 10_050,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, actualCost: null } });
    },
  });
  const ids: string[] = [];
  const result = await advanceInterview(input, request => client.ai.generateStructured(request),
    undefined, 1, metadata => { ids.push(metadata.requestId!); });
  assert.ok(result);
  assert.equal(aiCalls, 1);
  assert.deepEqual(ids, [requestId]);
});

test("SDK status and correlation survive service/structured errors; retry diagnostics do not inherit prior IDs", async () => {
  const client = createPlatformClient({
    platformUrl: "https://platform.example", applicationId: "test-app", applicationSecret: "test-secret",
    fetch: async (url, init) => String(url).endsWith("/api/bridge/login")
      ? Response.json({ ok: true, token: `mxt_${"a".repeat(24)}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString() })
      : new Response("do not log this content", { status: 503 }),
  });
  const input = make(["A process issue"]);
  await assert.rejects(advanceInterview(input, request => client.ai.generateStructured(request)),
    (error: unknown) => {
      const fields = safePlatformErrorMetadata(error);
      assert.deepEqual(fields, { code: "unavailable",
        requestId: (error as PlatformServiceError).requestId, status: 503 });
      assert.match(fields.requestId!, /^[0-9a-f-]{36}$/);
      assert.equal(JSON.stringify(fields).includes("do not log"), false);
      return true;
    });
  assert.deepEqual(safePlatformErrorMetadata(new PlatformServiceError("invalid_response", 200, "bad\nid")),
    { code: "invalid_response", requestId: undefined, status: 200 });
  const invalidClient = createPlatformClient({
    platformUrl: "https://platform.example", applicationId: "test-app", applicationSecret: "test-secret",
    fetch: async (url) => String(url).endsWith("/api/bridge/login")
      ? Response.json({ ok: true, token: `mxt_${"a".repeat(24)}`,
        expiresAt: new Date(Date.now() + 3600_000).toISOString() })
      : Response.json({ data: { invalid: true } }), // SDK response envelope validation fails
  });
  assert.equal(await advanceInterview(input, request => invalidClient.ai.generateStructured(request),
    (attempt, category, details) => {
      assert.equal(category, "sdk_invalid_response");
      assert.equal(attempt, 1);
      assert.equal(safePlatformErrorMetadata(details?.sdkError).code, "invalid_response");
      assert.match(safePlatformErrorMetadata(details?.sdkError).requestId!, /^[0-9a-f-]{36}$/);
    }, 1), null); // advanceInterview handles SDK validation failure

  const events: Array<{ attempt: number; id?: string; sdkId?: string }> = [];
  let currentId: string | undefined;
  let calls = 0;
  const result = await advanceInterview(input, async () => {
    if (++calls === 1) return { data: { invalid: true }, requestId: "first-attempt" };
    throw new PlatformServiceError("invalid_response", 200, "second-attempt");
  }, (attempt, _category, details) => {
    events.push({ attempt, id: currentId, sdkId: safePlatformErrorMetadata(details?.sdkError).requestId });
  }, 2, metadata => { currentId = metadata.requestId; },
  () => { currentId = undefined; });
  assert.equal(result, null);
  assert.deepEqual(events, [
    { attempt: 1, id: "first-attempt", sdkId: undefined },
    { attempt: 2, id: undefined, sdkId: "second-attempt" },
  ]);
});