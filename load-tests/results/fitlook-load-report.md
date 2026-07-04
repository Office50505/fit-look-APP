# FitLook Backend k6 Load Test Report

Generated: 2026-07-04T09:14:26.790Z
Base URL: http://localhost:5050

## Scope

Executed staged load profile: 10 concurrent users, then 100, then 1000.

Covered endpoints:
- GET /api/health
- GET /api/products
- GET /api/products?q=shirt
- GET /api/products?category=shirts
- GET /api/products with regex-character brand/gender filters
- GET /api/products/:id when at least one product exists
- POST /api/auth/login
- GET /api/auth/me
- GET /api/auth/me/body-photo
- GET /api/tryons
- GET /api/tryons/cache

Setup-only endpoint:
- POST /api/auth/signup, used once to create or reuse the test account

Not load-tested at 1000 VUs because they create persistent data or call paid/external services:
- POST /api/tryons/:productId
- POST /api/tryons/custom
- POST /api/tryons/external
- POST /api/tryons/vto-trial
- POST /api/products/amazon-search
- POST /api/products/preview-link
- POST /api/products
- POST /api/products/recategorize
- PATCH /api/products/:id/tryon-model
- DELETE /api/products/:id

## Overall Metrics

| Metric | Value |
| --- | ---: |
| Total requests | 13230.00 |
| Request rate/sec | 45.55 |
| Failed request rate | 3.32% |
| Check pass rate | 96.68% |
| Max VUs reached | 1000.00 |
| Avg duration ms | 8401.72 |
| Median duration ms | 2871.92 |
| p90 duration ms | 25199.36 |
| p95 duration ms | 28133.50 |
| p99 duration ms | 44919.87 |
| Max duration ms | 55027.37 |
| Avg waiting/TTFB ms | 8395.89 |
| p95 waiting/TTFB ms | 28133.48 |
| Avg blocked ms | 78.12 |
| Data received bytes | 68029332.00 |
| Data sent bytes | 3070897.00 |

## Endpoint Latency

| Endpoint | Avg ms | p95 ms | p99 ms | Max ms |
| --- | ---: | ---: | ---: | ---: |
| GET /api/health | 2891.83 | 21464.67 | 24468.86 | 25129.21 |
| GET /api/products | 5654.23 | 24908.45 | 30252.75 | 38041.47 |
| GET /api/products?q=shirt | 10951.67 | 28134.09 | 31525.61 | 40980.28 |
| GET /api/products?category=shirts | 11464.65 | 28105.41 | 31518.33 | 41080.95 |
| GET /api/products regex-character filters | 7347.55 | 21784.73 | 28138.43 | 41181.71 |
| GET /api/products/:id | 7253.80 | 22571.45 | 38146.88 | 41181.78 |
| POST /api/auth/login | 12150.62 | 43484.44 | 45841.28 | 50400.01 |
| GET /api/auth/me | 7762.62 | 28253.24 | 31638.62 | 38557.76 |
| GET /api/auth/me/body-photo | 12022.97 | 42767.37 | 50973.22 | 55027.37 |
| GET /api/tryons | 10656.30 | 51981.42 | 53335.19 | 55027.28 |
| GET /api/tryons/cache | 7404.77 | 39268.11 | 52014.70 | 54924.84 |

## Thresholds

- http_req_failed < 5%
- http_req_duration p95 < 2000 ms
- checks > 95%

## Result After Optimization

The backend improved from the first run, but it is still not ready for a 1000 concurrent user SLA on one local Node process.

| Metric | First run | After optimization |
| --- | ---: | ---: |
| Total requests | 10736 | 13230 |
| Request rate/sec | 36.95 | 45.55 |
| Failed request rate | 0.03% | 3.32% |
| Completed iterations | 462 | 610 |
| p95 duration ms | 30920 | 28133 |
| p99 duration ms | 33920 | 44920 |

Main remaining bottlenecks:
- `POST /api/auth/login` is expensive under peak load because password verification is CPU-bound.
- `GET /api/auth/me/body-photo` is expensive because it reads binary user photo data from MongoDB.
- Product listing latency is still high at 1000 VUs, even after short-lived read caching and indexes.
- At peak load k6 reported socket timeouts and connection resets, which points to local single-process connection pressure rather than only route logic.

Recommended next fixes:
- Run the backend with multiple Node workers using PM2 cluster mode, Node cluster, or container replicas behind a load balancer.
- Move read-through product/facet caches to Redis so all workers share cache entries.
- Store body photos in object storage or local static files instead of serving MongoDB binary data on hot authenticated routes.
- Reduce login frequency in real client flows by using token refresh/session reuse; do not make users log in repeatedly under normal traffic.
- Add MongoDB indexes for the highest-cardinality production filters after checking real query plans with `explain()`.
- Run the 1000 VU test against production-like infrastructure, not a local laptop process, before treating the result as a capacity number.

## Notes

- The regex-character filter request is included specifically to verify the product-filter fix under load.
- The signup endpoint is exercised once during setup to avoid creating thousands of persistent users.
- The try-on generation endpoints were intentionally excluded from high-concurrency load because they can call FAL image-generation services and write generated media.
