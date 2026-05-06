# Google Calendar Integration — Setup Guide

This guide walks a Workspace **admin** through enabling automatic Google
Calendar events when a schedule is booked in TMS.

When this is set up:
- Booking a schedule → every team member receives a Google Calendar invite.
- Cancelling a schedule → calendar event is deleted; attendees notified.
- Rescheduling → calendar event is patched; attendees notified.
- Each event auto-creates a Google Meet link (replaces the manual `roomLink`).

The service runs on a **Service Account with Domain-Wide Delegation** —
end users do not have to authorize anything.

---

## Prerequisites

1. Your company uses **Google Workspace** (not personal Gmail).
2. You have access to:
   - **Google Cloud Console** (to create the service account).
   - **Google Workspace Admin Console** (to grant Domain-Wide Delegation).
3. A **system mailbox** in your Workspace, e.g. `tms-system@yourdomain.com`.
   This account becomes the organiser of every TMS event. You can create
   it as a normal user or a shared mailbox.

---

## Step 1 — Create a Google Cloud project (or reuse existing)

1. Go to https://console.cloud.google.com.
2. If you already have a project for the existing Sheets sync, **reuse it**.
3. Otherwise create a new project. Name suggestion: `tms-prod`.

## Step 2 — Enable the required APIs

In your project: **APIs & Services → Library**, enable:
- **Google Calendar API**
- (If reusing the project) Google Sheets API should already be enabled.

## Step 3 — Create a Service Account

1. **APIs & Services → Credentials → Create Credentials → Service Account**.
2. Name: `tms-calendar`. Description: `TMS automated calendar events`.
3. Skip the "Grant access" step (we don't need IAM roles inside Cloud).
4. Click **Done**.

## Step 4 — Generate a key

1. Click on the new service account → **Keys** tab → **Add Key → JSON**.
2. A JSON file downloads — keep it safe. **This is the credential.**
3. Note the service account's **Unique ID** (a long number) — you will paste it
   into the Workspace admin console in the next step.

## Step 5 — Enable Domain-Wide Delegation

This is the key step that lets the service account act on behalf of users
in your domain.

1. Open the service account in Cloud Console → **Details** tab → enable
   **"Show domain-wide delegation"** if hidden → confirm the **Client ID**
   (this is what you paste in the next step).
2. Go to https://admin.google.com (Google Workspace admin).
3. Navigate to **Security → Access and data control → API controls →
   Manage Domain Wide Delegation**.
4. Click **Add new**.
5. **Client ID**: paste the service account's Client ID from step 1.
6. **OAuth scopes** (comma-separated):
   ```
   https://www.googleapis.com/auth/calendar
   ```
   If you also want this same service account to handle the existing
   Sheets sync, add:
   ```
   https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/spreadsheets.readonly
   ```
7. Click **Authorize**.

## Step 6 — Set environment variables in Render

In the Render dashboard for your TMS service → **Environment**:

| Variable | Value | How to obtain |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | The **entire contents** of the JSON file from step 4, as a single-line string | Open the JSON file, copy everything, paste as the value |
| `GOOGLE_CALENDAR_IMPERSONATE` | `tms-system@yourdomain.com` (the mailbox you created) | The system mailbox in your Workspace |
| `GOOGLE_WORKSPACE_DOMAIN` | `yourdomain.com` | Your Workspace domain |
| `TMS_TIMEZONE` *(optional)* | `Asia/Ho_Chi_Minh` (default) | Any IANA timezone |

**Tip on `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`**: the JSON contains newlines
inside `private_key`. Render handles multi-line env values fine — paste
the whole file as-is.

## Step 7 — Verify

1. Re-deploy. In server logs you should NOT see:
   ```
   WARN: Google service-account credentials not configured
   ```
2. Log in as admin → book a class for a team that has members with
   email addresses set.
3. Check the system mailbox's calendar — the event should be there.
4. Each member with a valid email receives an invite email.

If something goes wrong, check server logs for entries like
`Calendar event creation failed` — the error message tells you which
side (auth, scope, missing email) is the problem.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `WARN: GOOGLE_CALENDAR_IMPERSONATE not set` | Missing env var. |
| `Calendar event creation failed: invalid_grant: Invalid JWT signature` | Service account JSON is malformed or the wrong key was used. |
| `Calendar event creation failed: unauthorized_client` | DWD scope was not authorized in the Workspace admin console. |
| `Calendar event creation failed: Calendar usage limits exceeded` | The impersonated user has hit Calendar API quotas. Use a dedicated system mailbox. |
| Members don't receive invites | The User in TMS has no `email` field set. Admin must edit each user. |
| Meet link is missing on the event | The impersonated user's account must allow Meet creation (Workspace policy). |

---

## Required user data

For invitations to land, every TMS user who could be on a Schedule
**must have an `email` set on their User record**. Admins enter this
on the user form. The system **does not** infer an email from empCode.

Users without an email are still enrolled normally; they just don't
receive a calendar invite (the others do).
