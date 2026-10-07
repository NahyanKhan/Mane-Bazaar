# Owner steps for an end-to-end hosted acceptance test

The code supports an invited single-shop pilot. No hosted service has been created or charges incurred.

## 1. Upload source to the intended repository

Use https://github.com/NahyanKhan/Mane-Bazaar . The owner account already had permission; do not change ownership or add Alikhan207 again. The assistant write failed because this session's tool approval policy forbids the required approval.

Through your own GitHub session, use Add file > Upload files and upload the **contents of HMB-connected**, including public/, rather than the ZIP. If existing work is present, preserve it and use a branch for review. The supplied configuration expects package.json, Dockerfile and render.yaml at the repo root. Dot-prefixed files may need explicit file-picker selection; .github/workflows/test.yml provides CI.

Never manually upload .env, data/ or *.private.txt. GitHub's web uploader does not apply .gitignore to manually selected files.

## 2. Create/connect hosting

Sign in to https://dashboard.render.com and connect the NahyanKhan repository. Review current charges before creating a service: a persistent disk requires a paid service. This backend requires a Docker web service, not a static site.

Import render.yaml as a Blueprint, or configure:
- Runtime: Docker; Dockerfile: ./Dockerfile
- Instances: 1
- Health check: /health
- Persistent disk: /app/data, 1 GB for this small pilot
- DB_PATH: /app/data/pilot.sqlite

Set PUBLIC_ORIGIN to the exact assigned HTTPS origin, with no trailing slash. If Blueprint setup asks before exposing the assigned hostname, update the value after service creation and before testing. A wrong origin intentionally blocks browser requests.

The app binds to 0.0.0.0 and honours PORT. The host supplies HTTPS. The persistent mount must be writable by the container's node user; check deployment logs and resolve provider-specific mount permissions. Do not fall back to ephemeral storage. Docker has not been built in this environment.

## 3. Generate access keys

On your computer with Node.js 24+, inside the project:

```sh
npm run keys
```

Open pilot-access.private.txt yourself. Copy its SELLER_ACCESS_KEY_HASH, PILOT_ACCESS_KEY_HASH and RIDER_ACCESS_KEYS_JSON into the host environment.

Keep the actual seller key with the seller/operator, customer pilot key with invited testers, and rider key with that rider. Rider ID is rider. Do not send keys in chat. Keys are temporary pilot access, not the final public checkout design.

Initially keep WHATSAPP_SEND_ENABLED=false and VOICE_ENABLED=false. Redeploy with all required environment variables. Missing access configuration stops startup rather than enabling demo login.

## 4. Verify the website

1. /health must report ok:true and demo:false.
2. Open /seller, /customer and /rider with their correct keys on separate devices/tabs.
3. Follow README's COD order, acceptance, rider claim, code handover and receipt flow.
4. Verify other devices update without refreshing.
5. Restart/redeploy and confirm orders persist.
6. Verify wrong seller credentials fail and another customer sees no other customer's orders.

Use sample data. Closing a customer tab or logging out loses guest access; recovery is pending.

## 5. Connect Meta and optional voice

Follow WHATSAPP-SETUP.md. You need the Meta app, bot/test number, verified seller recipient, authorised token, app secret and webhook subscription. Sarvam is required by the implemented voice connector, but optional for text-only tests.

Then verify actual devices:
1. Seller sends ORDERS and receives a WhatsApp reply.
2. Seller sends the Kannada example and confirms the draft.
3. Consumer sees it and places COD order; seller receives an alert.
4. Seller replies ACCEPT then READY; consumer sees status changes.
5. Rider/customer finish handovers.
6. Send short Kannada and English voice listings. Check every field before confirmation. Try local phrasing and background noise; failed recognition needs tuning.

## What to send back in chat

Only non-secret information:
- Repo branch after upload.
- Public HTTPS URL, or redacted deployment error.
- Whether the Meta test number and seller recipient are ready.
- Whether Meta/Sarvam secrets are saved in host settings, not their values.
- Original problem statement for exact alignment review.

Account creation, phone verification, billing and provider approval need the owner. Dashboard configuration can continue through an authorised connection if available; no Render or Meta session is currently connected.

## Before real sales

Still needed: multi-seller separation, proper onboarding/customer recovery, payment/support/refund flow, rider operations, reservation expiry, backup restore testing, monitoring and local usability validation. This hosted invitation test is not a full production launch.

Official references: https://render.com/docs/docker , https://render.com/docs/disks , https://render.com/docs/blueprint-spec .
