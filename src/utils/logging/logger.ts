import { createLogger, format, transports } from 'winston';
import { LOGS_APPNAME } from '../../constants.js';

export const logger = createLogger({
  format: format.combine(
    format.colorize(),
    format.timestamp(),
    format.printf(({ timestamp, level, message }) => {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return `${timestamp} [${LOGS_APPNAME}] ${level}: ${message}`;
    }),
  ),
  transports: [new transports.Console()],
});
