import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import matrixRouter from "./matrix/platform";
import { requireMatrixSession } from "./matrix/auth";
import { logger } from "./lib/logger";
import { AIProviderNotConfiguredError } from "./lib/ai";
import { contentSafetyErrorHandler } from "./lib/content-safety";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          // Do not log attacker-controlled URL segments, query values or bodies.
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/matrix", matrixRouter);

// Matrix Platform Launch Guard: every business API requires an authenticated
// application session. Only the deployment health probe stays public.
app.use("/api", (req, res, next) => {
  if (req.path === "/healthz") {
    next();
    return;
  }
  void requireMatrixSession(req, res, next);
});
app.use("/api", router);
app.use(contentSafetyErrorHandler);

// Selecting a placeholder AI provider (via AI_PROVIDER) must surface as a
// clear 503, not an opaque 500.
app.use(
  (err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof AIProviderNotConfiguredError) {
      req.log.warn({ category: "provider_unavailable" }, "AI provider not configured");
      res.status(503).json({ error: err.message });
      return;
    }
    next(err);
  },
);

// Driver/validation errors can carry SQL parameters or rejected content.
app.use((_err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ category: "request_failed" }, "Request failed");
  res.status(500).json({ error: "The request could not be completed." });
});

export default app;
