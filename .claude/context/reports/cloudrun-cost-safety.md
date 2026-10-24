# Cloud Run cost-safety research (asia-southeast1), 2026-10-21
Caveat: cloud.google.com/run/pricing and /vpc/network-pricing render client-side; WebFetch only got titles. Price numbers below are therefore UNVERIFIED against the official page (taken from third-party quotes of the official table); tier assignment and all behaviours/doc statements ARE verified from official docs.

## 1. Tier and prices
- asia-southeast1 = Tier 2 (listed under "Subject to Tier 2 pricing"). VERIFIED: https://docs.cloud.google.com/run/docs/locations
- Request-based, Tier 1 (for reference): $0.000024/vCPU-s, $0.0000025/GiB-s, $0.40/M req (UNVERIFIED, third-party).
- Tier 2 request-based: $0.0000336/vCPU-s, $0.0000035/GiB-s (= 1.4x Tier 1, UNVERIFIED, dev.to quoting Billing Catalog). Requests: $0.40/M assumed (a 1.4x reading would give $0.56/M; UNVERIFIED). Official table: https://cloud.google.com/run/pricing
- Free tier (180,000 vCPU-s, 360,000 GiB-s, 2M req / month, per billing account): documented as one tier-agnostic allowance, but whether it covers Tier 2 regions is UNVERIFIED. It is negligible for a flood (~1 day of 1 vCPU).

## 2. Egress
- Premium Tier internet egress, worldwide (excl. China/Australia): ~$0.12/GiB for first 1 TiB, ~$0.11 for 1-10 TiB, ~$0.08 for 10+ TiB (UNVERIFIED, from memory/third-party). Free: ~1 GiB/month (UNVERIFIED; one doc snippet says North America only). Ingress free. https://cloud.google.com/vpc/network-pricing

## 3. Max-instances reached
- Requests pend up to 3.5x avg startup time (10 s min); if no instance frees, returns HTTP 429 "no available instance". VERIFIED: https://docs.cloud.google.com/run/docs/about-instance-autoscaling and https://docs.cloud.google.com/run/docs/troubleshooting
- Docs do NOT state whether 429-rejected requests are billed; a third-party note says they are excluded from request-count metrics (not a billing statement). Treat as UNVERIFIED, likely not billed (never reaches a container). The max-instances limit "can be exceeded for a brief period" during spikes: https://docs.cloud.google.com/run/docs/configuring/max-instances

## 4. Worst-case $/day (Tier 2, 86,400 s, free tier ignored, $0.40/M req)
Config A: 2 inst, 1 vCPU, 1 GiB, 1000 req/s total
- CPU 172,800 x 0.0000336 = $5.81; mem 172,800 GiB-s x 0.0000035 = $0.60 -> $6.41
- Requests 86.4M x $0.40 = $34.56 (at $0.56/M: $48.38)
- Egress 2 KB: 86.4M x 2048 B = 164.8 GiB x $0.12 = $19.78 -> TOTAL ~ $60.75/day (~$1,820/30d)
- Egress 230 KB bundle: 86.4M x 235,520 B = 18,950 GiB. Tiered: 1,024x0.12 + 9,216x0.11 + 8,710x0.08 = $1,833 (flat $0.12: $2,274) -> TOTAL ~ $1,874/day (up to ~$2,315)
Config B: 1 inst, 1 vCPU, 512 MiB, 500 req/s
- CPU 86,400 x 0.0000336 = $2.90; mem 43,200 x 0.0000035 = $0.15 -> $3.05
- Requests 43.2M x $0.40 = $17.28
- Egress 2 KB: 82.4 GiB x 0.12 = $9.89 -> TOTAL ~ $30.22/day
- Egress 230 KB: 9,475 GiB: 1,024x0.12 + 8,451x0.11 = $1,052 (flat: $1,137) -> TOTAL ~ $1,073/day (up to ~$1,158)
Note: 500 req/s x 230 KB = ~920 Mbps per instance; likely above real per-instance throughput, so bundle case is a ceiling. Static bundle should be on CDN/Firebase Hosting/Storage, not Cloud Run.

## 5. Caps
(a) Alert-only budgets do not cap usage; first notification can take "several hours"; costs lag usage; set budget below available funds. https://docs.cloud.google.com/billing/docs/how-to/budgets
(b) Kill switch: https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications . Budget -> Pub/Sub -> Cloud Run function (stopBilling / stop_billing) detaches billing. Sample grants the function's service account roles/billing.admin on the billing account (docs name no narrower role). Warnings: "Resources might be irretrievably deleted"; terminates ALL services in the project incl. free-tier; re-enabling needs manual config, no guarantee of recovery; notification delay means extra costs; does not guarantee spend stays under budget; Python sample defaults SIMULATE_DEACTIVATION=True; cannot disable on a project locked to a billing account. Outstanding charges remain owed (https://docs.cloud.google.com/billing/docs/how-to/modify-project).
(c) NEW native feature exists: "spend cap budgets" - per project AND per service, monthly; Cloud Run and Cloud Run functions are supported (also Gemini API). Alerts at 50/80/100%; at 100% of gross estimated cost, new usage of that service is paused until the next period or manual lift (lift may take up to 1 h). Limits: not instant (cost data can lag >24 h, overage still billed), in-flight requests finish and bill, persistent resources keep billing, launch stage (preview/GA) not stated. Needs billing.budgets.configureSpendCap (Billing Account Admin) etc. https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps . Known-issues: after a cap/billing disable, up to 30 min delay and 429/503s (https://docs.cloud.google.com/run/docs/issues).
(d) Cloud Run settings: max-instances (limits compute, not request/egress fees); concurrency; --no-allow-unauthenticated (IAM rejects unauthenticated calls at the front end; billing of those rejections UNVERIFIED); request timeout; ingress internal / internal-and-cloud-load-balancing blocks direct run.app internet access; --no-default-url. https://docs.cloud.google.com/run/docs/securing/ingress
(e) Cloud Armor rate limiting requires external Application LB + Armor policy (Standard tier policy/rule/request fees; LB forwarding rule ~ $18/mo): figures UNVERIFIED (page not fetchable). https://cloud.google.com/armor/pricing , https://cloud.google.com/load-balancing/pricing

## 6. Prepaid card
- A card limit does not cap liability. Docs: "You're still responsible for all outstanding charges" (modify-project page). Google Cloud Terms: customer liable for delinquent amounts, may suspend, interest up to 1.5%/mo, collection costs incl. attorney fees; card fees overdue 30 days after month end. Terms: https://cloud.google.com/terms (search result; details secondary-sourced, partly UNVERIFIED).

## Sources
- https://docs.cloud.google.com/run/docs/locations
- https://cloud.google.com/run/pricing (not fetchable)
- https://cloud.google.com/vpc/network-pricing (not fetchable)
- https://docs.cloud.google.com/run/docs/about-instance-autoscaling
- https://docs.cloud.google.com/run/docs/configuring/max-instances
- https://docs.cloud.google.com/run/docs/troubleshooting
- https://docs.cloud.google.com/run/docs/issues
- https://docs.cloud.google.com/run/docs/securing/ingress
- https://docs.cloud.google.com/billing/docs/how-to/budgets
- https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps
- https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications
- https://docs.cloud.google.com/billing/docs/how-to/modify-project
- https://cloud.google.com/armor/pricing , https://cloud.google.com/load-balancing/pricing
- Third-party (price figures): https://dev.to/elimio/what-cloud-run-costs-with-worked-examples-378i
