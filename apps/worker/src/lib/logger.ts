import pino, { type Logger } from "pino";
import { env } from "./env";

export type { Logger };

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: { svc: "worker" },
  ...(env.LOG_PRETTY ? { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss" } } } : {}),
});
