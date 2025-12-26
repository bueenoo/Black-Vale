import pino from "pino";

export function createLogger(level: string = "info") {
  return pino({
    level,
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
        : undefined,
  });
}
