"""Billing kill switch: unlink billing from the project once the budget is reached.

Triggered by Pub/Sub messages from a Cloud Billing budget (Google's "disable billing with
notifications" pattern). Budgets publish several times a day whether or not a threshold is
crossed, so this only acts when costAmount >= budgetAmount.

Unlinking billing stops every paid service in the project (Cloud Run goes down). To restore:
    gcloud billing projects link <project> --billing-account <account-id>

Publish {"dryRun": true} to the topic to check permissions without changing anything.
"""
from __future__ import annotations

import base64
import json
import os

import functions_framework
from googleapiclient import discovery

PROJECT_ID = os.environ["TARGET_PROJECT"]
PROJECT_NAME = f"projects/{PROJECT_ID}"
UNLINK_PERMISSION = "resourcemanager.projects.deleteBillingAssignment"


@functions_framework.cloud_event
def stop_billing(cloud_event) -> None:
    payload = json.loads(base64.b64decode(cloud_event.data["message"]["data"]).decode("utf-8"))

    if payload.get("dryRun"):
        crm = discovery.build("cloudresourcemanager", "v1", cache_discovery=False)
        granted = crm.projects().testIamPermissions(
            resource=PROJECT_ID, body={"permissions": [UNLINK_PERMISSION]}
        ).execute().get("permissions", [])
        print(f"DRY RUN: can unlink billing for {PROJECT_ID}: {UNLINK_PERMISSION in granted}")
        return

    cost, budget = float(payload["costAmount"]), float(payload["budgetAmount"])
    currency = payload.get("currencyCode", "")
    if cost < budget:
        print(f"OK: cost {cost:.2f} {currency} is below budget {budget:.2f} {currency}; no action")
        return

    billing = discovery.build("cloudbilling", "v1", cache_discovery=False)
    if not billing.projects().getBillingInfo(name=PROJECT_NAME).execute().get("billingEnabled"):
        print(f"Billing already disabled for {PROJECT_ID}")
        return
    billing.projects().updateBillingInfo(name=PROJECT_NAME, body={"billingAccountName": ""}).execute()
    print(f"KILL SWITCH: cost {cost:.2f} >= budget {budget:.2f} {currency}; billing unlinked from {PROJECT_ID}")
