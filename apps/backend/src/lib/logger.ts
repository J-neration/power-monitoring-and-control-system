import { pino, transport as pinoTransport } from "pino";

export const buildLogger = () => {
  const level = process.env.LOG_LEVEL ?? "info";

  if (process.env.NODE_ENV === "development") {
    const transport = pinoTransport({
      target: "pino-pretty",
      options: { colorize: true },
    });
    return pino({ level }, transport);
  }

  return pino({ level });
};
