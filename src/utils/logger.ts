import winston from 'winston';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const logger = winston.createLogger({
  levels,
  level: 'info',
  transports: [
    // for all other logs - json format
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format((info: any) => {
          if (info.level === 'http') {
            return false;
          }
          return info;
        })(),
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss',
        }),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
    }),
    // Transport for HTTP logs only - with custom formatting
    new winston.transports.Console({
      level: 'http',
      format: winston.format.combine(
        winston.format((info: any) => {
          if (
            info.level === 'http' &&
            typeof info.message === 'object' &&
            info.message.event &&
            info.message.data
          ) {
            return info;
          }
          return false; // Skip non-HTTP logs in this transport
        })(),
        winston.format.printf(({ message }: { message: any }) => {
          const { event, data } = message;
          const { status, ms, ip, userAgent, body, userId } = data;

          // ANSI color codes
          const ansiColors = {
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            red: '\x1b[31m',
            gray: '\x1b[90m',
            cyan: '\x1b[36m',
            reset: '\x1b[0m',
          } as const;

          let coloredStatus: string;
          const statusNum = parseInt(status);
          if (statusNum >= 200 && statusNum < 300) {
            coloredStatus = `${ansiColors.green}${status}${ansiColors.reset}`;
          } else if (statusNum >= 300 && statusNum < 400) {
            coloredStatus = `${ansiColors.yellow}${status}${ansiColors.reset}`;
          } else {
            coloredStatus = `${ansiColors.red}${status}${ansiColors.reset}`;
          }

          let logLine = `${event} ${coloredStatus} ${ms}`;

          if (userId) {
            logLine += ` ${ansiColors.gray}${userId}${ansiColors.reset}`;
          }

          if (ip && ip !== '-') {
            logLine += ` ${ansiColors.gray}${ip}${ansiColors.reset}`;
          }

          if (userAgent) {
            logLine += ` ${ansiColors.gray}${userAgent}${ansiColors.reset}`;
          }

          if (body && body.trim()) {
            logLine += ` ${ansiColors.cyan}${body}${ansiColors.reset}`;
          }

          return logLine;
        })
      ),
    }),
  ],
});

type LogExceptionInput = {
  event: string;
  error: any;
  captureException?: boolean;
};

export const logException = ({
  event,
  error,
  captureException,
}: LogExceptionInput) => {
  if (error instanceof Error) {
    logger.error({
      event: `${event}.exception`,
      data: {
        name: error.name,
        message: error.message,
      },
    });
    logger.debug({
      event: `${event}.exception`,
      data: { errStack: error.stack },
    });
  } else {
    logger.error({
      event: `${event}.exception`,
      data: {
        error,
      },
    });
  }
};

export default logger;
