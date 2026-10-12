import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startKeepAlive();
});

function startKeepAlive() {
  const externalUrl =
    process.env["RENDER_EXTERNAL_URL"] ??
    process.env["APP_URL"] ??
    "https://coronarylens-3d.onrender.com";

  const targetUrl = externalUrl.endsWith("/api/health")
    ? externalUrl
    : `${externalUrl.replace(/\/+$/, "")}/api/health`;

  // Render spins down free tier instances after 15 minutes; ping every 10 minutes
  const PING_INTERVAL_MS = 10 * 60 * 1000;

  if (process.env["NODE_ENV"] === "production" || process.env["ENABLE_KEEP_ALIVE"] === "true") {
    logger.info({ targetUrl, intervalMinutes: 10 }, "Keep-alive ping service initiated");

    setInterval(async () => {
      try {
        const response = await fetch(targetUrl);
        logger.info({ status: response.status, targetUrl }, "Keep-alive ping sent");
      } catch (error) {
        logger.warn({ error: error instanceof Error ? error.message : String(error) }, "Keep-alive ping failed");
      }
    }, PING_INTERVAL_MS);
  }
}
