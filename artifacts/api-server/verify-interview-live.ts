// Opt-in, read-only Platform inference. No server, database or Jira access.
// Run from artifacts/api-server with LIVE_INTERVIEW_AI=1 and existing Platform
// application credentials; never print provider metadata or conversation.
import { createPlatformClient, PlatformServiceError } from "@workspace/matrix-sdk";
import { advanceInterview } from "./src/routes/interview-ai";

if (process.env.LIVE_INTERVIEW_AI !== "1") {
  console.error("Live verification disabled; set LIVE_INTERVIEW_AI=1 explicitly.");
  process.exitCode = 1;
} else if (!process.env.PLATFORM_APPLICATION_ID || !process.env.PLATFORM_APPLICATION_SECRET) {
  console.error("Live verification requires existing Platform application credentials.");
  process.exitCode = 1;
} else {
  const platform = createPlatformClient({
    platformUrl: process.env.MATRIX_PLATFORM_URL || "https://matrix-platform.replit.app",
    applicationId: process.env.PLATFORM_APPLICATION_ID,
    applicationSecret: process.env.PLATFORM_APPLICATION_SECRET,
  });
  try {
    // The original adaptive follow-up wording is not known; use neutral labels,
    // but preserve all three real user responses exactly.
    const result = await advanceInterview({
      jira: null,
      turns: [
        {
          question: "What problem or opportunity would you like to address?",
          answer: "We spend too much time manually handling client requests that come in through email. I think there should be a better way to track and route them.",
        },
        {
          question: "Follow-up question 1",
          answer: "Client requests usually come directly to our account managers by email. They forward them to different people in operations depending on what the client needs. There isn't really one place to see all open requests, who owns them, or whether they were completed. It affects Account Management, Operations, and ultimately the client.",
        },
        {
          question: "Follow-up question 2",
          answer: "Account managers have to read each request, figure out who should handle it, forward it to the right person, and then manually follow up to find out whether it was completed. Operations may also have to ask questions back through the account manager. We don't know exactly how much time this consumes, but with the number of clients we have it happens constantly.",
        },
      ],
    }, request => platform.ai.generateStructured(request),
    (attempt, category) => console.error(`Validation attempt ${attempt}: ${category}.`),
    process.env.LIVE_INTERVIEW_SINGLE_ATTEMPT === "1" ? 1 : 2);
    if (!result) throw new Error("invalid_response");
    if (!result.nextQuestion) throw new Error("no_next_question");
    console.log(result.nextQuestion);
  } catch (error) {
    // Never log an exception object: upstream bodies, tokens and input may be sensitive.
    const code = error instanceof PlatformServiceError ? error.code :
      error instanceof Error && ["invalid_response", "no_next_question"].includes(error.message)
        ? error.message : "unavailable";
    console.error(`Live verification failed: ${code}.`);
    process.exitCode = 1;
  }
}