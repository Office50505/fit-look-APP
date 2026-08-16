import { randomUUID } from 'node:crypto';

const serviceName = process.env.SERVICE_NAME || 'lookmefy-api';

function clean(value, depth = 0) {
  if (depth > 5) return '[depth-limit]';
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : value.stack
    };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => clean(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (/password|token|secret|authorization|cookie|otp/i.test(key)) return [key, '[redacted]'];
    return [key, clean(entry, depth + 1)];
  }));
}

function log(level, event, meta = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    service: serviceName,
    env: process.env.NODE_ENV || 'development',
    event,
    ...clean(meta)
  };
  const output = JSON.stringify(line);
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}

const logger = {
  child(defaults = {}) {
    return {
      info(event, meta = {}) {
        log('info', event, { ...defaults, ...meta });
      },
      warn(event, meta = {}) {
        log('warn', event, { ...defaults, ...meta });
      },
      error(event, meta = {}) {
        log('error', event, { ...defaults, ...meta });
      }
    };
  },
  info(event, meta = {}) {
    log('info', event, meta);
  },
  warn(event, meta = {}) {
    log('warn', event, meta);
  },
  error(event, meta = {}) {
    log('error', event, meta);
  }
};

function requestId() {
  return randomUUID();
}

export { logger, requestId };
