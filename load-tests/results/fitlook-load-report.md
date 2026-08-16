# FitLook Backend k6 Load Test Report

Generated: 2026-08-07T08:33:19.603Z
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
- GET /api/auth/me
- GET /api/tryons
- GET /api/tryons/credit-history

Setup-only endpoints:
- POST /api/auth/otp/send
- POST /api/auth/otp/verify

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
| Total requests | 37151.00 |
| Request rate/sec | 137.14 |
| Failed request rate | 0.00% |
| Check pass rate | 100.00% |
| Max VUs reached | 1000.00 |
| Avg duration ms | 3234.33 |
| Median duration ms | 0.84 |
| p90 duration ms | 13023.20 |
| p95 duration ms | 19997.52 |
| p99 duration ms | 28031.55 |
| Max duration ms | 44237.62 |
| Avg waiting/TTFB ms | 3234.28 |
| p95 waiting/TTFB ms | 19997.46 |
| Avg blocked ms | 0.01 |
| Data received bytes | 336661392.00 |
| Data sent bytes | 8551864.00 |

## Endpoint Latency

| Endpoint | Avg ms | p95 ms | p99 ms | Max ms |
| --- | ---: | ---: | ---: | ---: |
| GET /api/health | 0.86 | 1.25 | 8.39 | 20.20 |
| GET /api/products | 802.42 | 8682.75 | 14543.54 | 18035.99 |
| GET /api/products?q=shirt | 1495.52 | 18009.73 | 20649.53 | 21983.11 |
| GET /api/products?category=shirts | 1540.35 | 13023.77 | 14702.87 | 15603.13 |
| GET /api/products regex-character filters | 3318.92 | 22987.60 | 24340.73 | 25695.39 |
| GET /api/products/:id | 3016.97 | 20373.22 | 23624.11 | 24995.73 |
| GET /api/auth/me | 3516.88 | 11270.33 | 12253.76 | 13776.80 |
| GET /api/tryons | 7276.23 | 21013.10 | 27073.63 | 29036.22 |
| GET /api/tryons/credit-history | 8292.91 | 35057.17 | 42001.69 | 44237.62 |

## Thresholds

- http_req_failed < 5%
- http_req_duration p95 < 2000 ms
- checks > 95%

## Notes

- The regex-character filter request is included specifically to verify the product-filter fix under load.
- OTP auth is exercised once during setup to avoid creating thousands of persistent users.
- The try-on generation endpoints were intentionally excluded from high-concurrency load because they can call FAL image-generation services and write generated media.
