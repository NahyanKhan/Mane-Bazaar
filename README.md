# Mane Bazaar — connected pilot v0.3

Mobile-friendly Kannada/English seller app, consumer storefront and rider view on one persistent SQLite database. Includes live updates, a signed WhatsApp webhook, automatic seller order alerts and optional short voice transcription.

**This is an invitation pilot with one sample shop, not a launched marketplace. External providers are tested with mocks, not live credentials. Use sample details and COD during acceptance testing.**

## Run locally

Node.js 24+ is required. No npm package installation is needed.

```sh
npm start
```

Open separate tabs at http://127.0.0.1:4180/seller , /customer and /rider. Choose test accounts. Local demo mode binds to localhost; do not tunnel it to the internet.

## Hosted mode

Follow DEPLOYMENT.md. The command `npm run start:hosted` requires an HTTPS public origin and separate hashed seller, customer-pilot and rider access keys. It disables demo account selection.

Customers do not register an account, but need a pilot invitation key. Every entry gets a separate customer session lasting eight hours in the current tab. Closing the tab or logging out loses access to previous guest orders. Cross-device recovery/OTP is not implemented.

`npm run keys` creates a private local file containing random access keys and the hashes required by the host. Never upload that file. Rotating a configured hash invalidates all hosted sessions. This is operator-managed invitation access, not verified identity.

## Complete a sample order

1. Customer orders a product, chooses COD and requests a pilot rider.
2. Seller sees the order live. If WhatsApp is enabled, an alert is queued to the configured seller number.
3. Seller accepts in the app or replies `ACCEPT MB-...`, then marks ready in the app or with `READY MB-...`.
4. Rider selects Vidyanagar, goes online and claims the order. Claims are exclusive.
5. Seller gives the pickup code at handover; rider enters it.
6. Customer gives the receipt code at delivery; rider enters it.
7. Customer selects received. The business record updates from the order.

Pickup and self-delivery also work. Handover codes are workflow evidence, not fraud guarantees. Seller-recorded payments are never labelled bank-verified.

## WhatsApp and voice

The seller text console uses the same command handler as the webhook. Try:

```text
chakli 20 boxes, 150 rupees per box, 250 g
ಚಕ್ಲಿ 20 ಡಬ್ಬಿ, ಪ್ರತಿ ಡಬ್ಬಿಗೆ 150 ರೂಪಾಯಿ, 250 ಗ್ರಾಂ
```

Check the draft and send `CONFIRM <draft ID>`. The consumer storefront updates live. `ORDERS`, `ACCEPT <order ID>` and `READY <order ID>` use the same database.

With Meta and Sarvam configured, an audio message is queued for transcription, the transcript is returned, and a listing draft is attempted. Spoken commands cannot publish or modify orders; confirmation must be text.

**The parser still only recognizes constrained chakli/peda examples.** Use the product form for other categories. Missing fields prompt clarification. Voice accuracy, accents, natural numbers and Kannada copy need real-user validation; automated voice tests mock the transcript.

## Implemented

- Persistent orders, inventory reservation, cutoff and shop availability checks.
- Seller products/profile editing; consumer search and tracking.
- Live updates with role-based data scoping and reconnect refresh.
- Approximate neighbourhood rider matching, exclusive claim and handover codes.
- Signed Meta webhook, allowlisted seller, duplicate-message protection.
- Durable alerts/replies; recent-window text or a configured approved order template.
- Delivery-status callbacks; no blind retry for uncertain sends.
- Optional queued voice transcription, restricted media URLs and no local audio-file retention.
- Invitation access, server-side logout and hosted configuration validation.
- Dockerfile, Render configuration and GitHub Actions tests.

## Not yet live or outside this pilot

- Public deployment, actual WhatsApp delivery and real speech recognition validation.
- Multiple sellers, normal onboarding, customer recovery and support/abuse handling.
- Third-party riders, GPS, route batching, delivery fees and rider compensation.
- UPI initiation/QR/reconciliation, refunds or bank-verified history. UPI is a preference only.
- General natural-language listing extraction, a shareable Passport and formalisation guidance.
- Reservation expiry, backup/restore verification and operational monitoring.

One order contains one product with multiple packs. Pending orders reserve stock until cancellation or decline. Cancellation does not issue refunds. An already picked-up parcel needs human support.

## Checks

```sh
npm run check
npm test
```

24 integration scenarios cover shared order flows, live events, persistence, permissions, hosted access, notification rules and voice handling. Node reports 27 passing test entries including three parent groups. No test contacts a real provider. Browser visual QA and Docker/Render deployment have not been performed here.

## Assets and repository

Photos are illustrative and need internet: Chakli by Essh2981 (CC BY-SA 4.0), Dharwad peda by Pamri and mango pickle by MrAngryEyes (public domain). In-app credits link to the originals. Fonts: DM Sans and Noto Sans Kannada.

Repository: https://github.com/NahyanKhan/Mane-Bazaar

Put this folder's contents at the repository root for the supplied deployment/CI configuration. Do not upload the ZIP as source, .env, data/ or *.private.txt. No push has occurred: the session approval policy rejected the repository write.
