# Deploy the single-container app (FastAPI API + static dashboard) to Google Cloud Run.
#
# One-time setup (run yourself, interactive):
#   gcloud auth login
#   gcloud config set project <your-project-id>
#
# Then:  .\deploy\cloudrun.ps1 -Project <your-project-id>
# Cloud Build builds the repo's Dockerfile remotely, so Docker isn't needed locally.
param(
    [Parameter(Mandatory = $true)][string]$Project,
    [string]$Region = "asia-southeast1",   # Singapore
    [string]$Service = "sgx-statarb"
)
# No $ErrorActionPreference = "Stop": gcloud writes progress to stderr, which PowerShell 5.1 would treat as fatal.
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "Enabling required APIs on $Project (no-op if already enabled)..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com --project $Project

Write-Host "Building and deploying $Service to $Region..."
gcloud run deploy $Service `
    --project $Project `
    --region $Region `
    --source . `
    --port 8080 `
    --memory 1Gi `
    --cpu 1 `
    --min-instances 0 `
    --max-instances 2 `
    --allow-unauthenticated `
    --set-env-vars STATARB_OFFLINE=1

$url = gcloud run services describe $Service --project $Project --region $Region --format "value(status.url)"
Write-Host "Smoke test: $url/api/health"
Invoke-RestMethod "$url/api/health"
Write-Host "Live at $url"
