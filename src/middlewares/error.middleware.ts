import logger from '$/utils/logger';
import { type ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

const errorHandler: ErrorHandler = (err, c) => {
  console.log(err, 'err');

  logger.info({
    event: 'error.handler',
    msg: {
      err,
    },
  });

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  return new Response('Серверийн алдаа', {
    status: 500,
    statusText: err?.message || 'Серверийн алдаа',
  });
};

export default errorHandler;
