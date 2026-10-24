# Block all public internet traffic to the dashboard (the default state outside demos).
# With ingress "internal", Google's front end rejects outside requests with 404 before they
# reach the container, so a flood can't run up compute or outbound-data charges.
param(
    [string]$Project = "is4228-sgx-statarb",
    [string]$Region = "asia-southeast1",
    [string]$Service = "sgx-statarb"
)
# gcloud reports progress on stderr, so check its exit code rather than using -ErrorAction Stop.
gcloud run services update $Service --project $Project --region $Region --ingress internal --quiet 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "gcloud failed to lock $Service (exit $LASTEXITCODE)" }
Write-Host "LOCKED: public requests now get 404. Unlock with .\deploy\demo-unlock.ps1"
