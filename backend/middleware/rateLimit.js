// ============================================================
// Minimal in-memory rate limiter (no external dependency)
// ============================================================
// Protects sensitive endpoints (login, OTP, registration) from brute-force
// and abuse. Counters are per-process; for a multi-instance deployment swap
// this for a shared store (e.g. Redis).

const buckets = new Map();

// Periodically drop expired buckets so memory doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60 * 1000).unref?.();

/**
 * @param {object} options
 * @param {number} options.windowMs  Time window in milliseconds
 * @param {number} options.max       Max requests allowed per window
 * @param {string} options.message   Error message returned when exceeded
 */
const rateLimit = ({ windowMs = 15 * 60 * 1000, max = 20, message } = {}) => {
  return (req, res, next) => {
    const key = `${req.ip || req.connection?.remoteAddress || 'unknown'}:${req.baseUrl}${req.path}`;
    const now = Date.now();

    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);

      return res.status(429).json({
        message:
          message ||
          'Too many requests. Please wait a moment and try again.'
      });
    }

    next();
  };
};

module.exports = { rateLimit };
