import winston from 'winston';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}] ${message}${metaStr}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(timestamp(), errors({ stack: true })),
  transports:
    process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error', format: json() }),
          new winston.transports.File({ filename: 'logs/combined.log', format: json() }),
          new winston.transports.Console({ format: combine(timestamp(), json()) }),
        ]
      : [
          new winston.transports.Console({
            format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), devFormat),
          }),
        ],
});

export default logger;
