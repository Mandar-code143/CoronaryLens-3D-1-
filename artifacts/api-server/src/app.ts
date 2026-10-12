import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (allowedOrigins.length > 0) {
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error("CORS origin is not allowed by CORS_ORIGINS."));
    },
  }));
}
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

app.use("/api", router);

// In a single-container deployment, serve the already-built Vite frontend from the API origin.
// In Replit's split-service routing, the static frontend service serves these assets instead.
const frontendCandidates = [
  path.resolve(process.cwd(), "artifacts/coronarylens-3d/dist/public"),
  path.resolve(process.cwd(), "../../artifacts/coronarylens-3d/dist/public"),
  path.resolve(process.cwd(), "../../../artifacts/coronarylens-3d/dist/public"),
];
const frontendDirectory = frontendCandidates.find((candidate) =>
  existsSync(path.join(candidate, "index.html")),
);
if (frontendDirectory) {
  app.use(express.static(frontendDirectory, { index: false, maxAge: "1h" }));
  app.get("*splat", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(frontendDirectory, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}

export default app;
