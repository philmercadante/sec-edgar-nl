import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/core/rate-limiter.js';

describe('RateLimiter', () => {
  it('allows immediate acquisition when tokens are available', async () => {
    const limiter = new RateLimiter(10);
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10);
  });

  it('throttles when tokens are exhausted', async () => {
    const limiter = new RateLimiter(2);

    // Exhaust tokens
    await limiter.acquire();
    await limiter.acquire();

    // This should wait
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(100); // Should wait at least some time
  });

  it('refills tokens over time', async () => {
    const limiter = new RateLimiter(10);

    // Exhaust all tokens
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
    }

    // Wait for refill
    await new Promise(resolve => setTimeout(resolve, 200));

    // Should be able to acquire quickly now
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
