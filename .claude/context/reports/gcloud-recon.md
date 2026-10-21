# gcloud recon: Cloud Run deploy (read-only)

**Blocker: gcloud auth is broken.** `gcloud auth list` shows brianlimyensing@gmail.com as ACTIVE, but every API call fails with `invalid_grant: Bad Request` (token refresh failed). Fix needs a user-run `gcloud auth login` (not run by this recon).

- Gcloud: Google Cloud SDK 487.0.0
- Account: brianlimyensing@gmail.com (active, token invalid)
- Active project id: `lounge-bookings` (from `gcloud config list`). Note: this is not the IS4228 project name, so confirm it is the intended project.
- Project name/number/lifecycle: UNKNOWN (describe failed)
- Billing enabled: UNKNOWN (describe failed)
- APIs (run, artifactregistry, cloudbuild): UNKNOWN (services list failed)
- Existing Cloud Run services: UNKNOWN (list failed)
- run/region: unset. compute/region: unset.

## Research (unverified snippets, check official pages)
- Cloud Run free tier, commonly cited: 180,000 vCPU-s, 360,000 GiB-s, 2M requests per month. Some snippets show 240,000 / 450,000 for instance-based billing. Confirm at cloud.google.com/run/pricing.
- `gcloud run deploy --source .` uses Cloud Build and Artifact Registry (buildpacks). Enable: `artifactregistry.googleapis.com cloudbuild.googleapis.com run.googleapis.com` (logging also recommended). Deploy creates an AR repo `cloud-run-source-deploy` in the region if missing.
- Region: asia-southeast1 (Singapore).
- Cold start, min-instances=0, ~600MB Python image: estimate roughly 5-15 s first request (my estimate, not measured).

## Recommended steps
1. User runs: `gcloud auth login` and confirm project with `gcloud config set project <id>` (user's own action).
2. Re-run the read-only checks above.
3. Enable APIs (user action): `gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com --project=<id>`
4. Deploy:
   `gcloud run deploy sgx-statarb --source . --region asia-southeast1 --allow-unauthenticated --port 8080 --memory 1Gi --min-instances 0 --max-instances 2`

## Expected cost (class demo, estimate)
- Low traffic at min-instances=0 should sit inside the free tier: likely $0 for compute.
- Artifact Registry storage for ~600MB image: pennies per month (estimate).
- Cloud Build: within the free daily build minutes (estimate).
- Stay within budget by keeping max-instances at 2.

## Blockers
- Auth refresh failure (above). Nothing else can be verified until fixed.
- Billing and API status unknown until auth works.
- Confirm project id `lounge-bookings` is correct.
