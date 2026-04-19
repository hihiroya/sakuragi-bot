import winston from "winston";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.printf((info: any) =>
      `${info.timestamp} [${info.level}] ${info.message}${info.stack ? `\n${info.stack}` : ""}`
    )
  ),
  transports: [new winston.transports.Console()]
});
