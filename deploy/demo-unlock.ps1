# Make the dashboard public (run shortly before presenting).
# Takes effect in about 10 seconds. Lock it again afterwards with .\deploy\demo-lock.ps1
param(
    [string]$Project = "is4228-sgx-statarb",
    [string]$Region = "asia-southeast1",
    [string]$Service = "sgx-statarb"
)
# gcloud reports progress on stderr, so check its exit code rather than using -ErrorAction Stop.
gcloud run services update $Service --project $Project --region $Region --ingress all --quiet 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "gcloud failed to unlock $Service (exit $LASTEXITCODE)" }
Start-Sleep 10
$url = gcloud run services describe $Service --project $Project --region $Region --format "value(status.url)"
Invoke-RestMethod "$url/api/health" | Out-Null
Write-Host "PUBLIC: $url (remember to run .\deploy\demo-lock.ps1 when done)"
