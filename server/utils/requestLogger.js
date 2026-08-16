import { logger, requestId } from './logger.js';

function requestLogger(req, res, next) {
  const id = req.headers['x-request-id'] || requestId();
  const start = performance.now();
  req.id = String(id);
  res.setHeader('X-Request-Id', req.id);

  res.on('finish', () => {
    const durationMs = Math.round(performance.now() - start);
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('http_request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      userId: req.user?._id?.toString?.(),
      ip: req.ip
    });
  });

  next();
}

function errorLogger(error, req, res, _next) {
  logger.error('unhandled_request_error', {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl || req.url,
    userId: req.user?._id?.toString?.(),
    error
  });
  if (res.headersSent) return;
  res.status(error.statusCode || 500).json({ message: error.message || 'Something went wrong' });
}

export { errorLogger, requestLogger };
