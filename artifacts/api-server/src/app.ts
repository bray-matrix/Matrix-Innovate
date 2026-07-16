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

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
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

// Selecting a placeholder AI provider (via AI_PROVIDER) must surface as a
// clear 503, not an opaque 500.
app.use(
  (err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof AIProviderNotConfiguredError) {
      req.log.warn({ err }, "AI provider not configured");
      res.status(503).json({ error: err.message });
      return;
    }
    next(err);
  },
);

export default app;
