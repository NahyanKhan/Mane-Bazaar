# Activate WhatsApp and Kannada/English voice

There are two numbers: the **Meta business/bot number** and the **seller's ordinary WhatsApp number** that messages it. WHATSAPP_PHONE_NUMBER_ID identifies the bot. WHATSAPP_SELLER_NUMBER is the seller's digits-only international number. This pilot accepts one seller.

## Owner setup

1. Sign into your Meta developer account, create/configure an app with the WhatsApp product, and start with its test number. Add and verify your seller test recipient. Complete Meta's account and phone checks yourself.
2. Deploy invitation mode over HTTPS using DEPLOYMENT.md.
3. Put these values in the host's secret environment settings, not GitHub or chat:
   - WHATSAPP_APP_SECRET: Meta app secret.
   - WHATSAPP_ACCESS_TOKEN: authorised messaging token; observe its expiry and replace temporary tokens for ongoing use.
   - WHATSAPP_VERIFY_TOKEN: your own random webhook verification value.
   - WHATSAPP_PHONE_NUMBER_ID: Meta business/test number ID.
   - WHATSAPP_SELLER_NUMBER: verified seller test recipient, country code plus number.
   - WHATSAPP_GRAPH_VERSION: supported version shown in your Meta app.
4. Register https://YOUR-HOST/webhooks/whatsapp with the same verify token and subscribe to messages for your WhatsApp Business Account.
5. Set WHATSAPP_SEND_ENABLED=true only when ready for actual test sends and provider charges.
6. Seller messages ORDERS to the bot; verify a real reply. Place a sample COD order on the website and verify a real seller notification.

## Reply window and templates

Text uses a conservative 23-hour window from the provider timestamp of a seller message. Missing or stale timestamps do not open it.

Outside the window, order alerts need a Meta-approved template. Configure a template with a fixed introduction and exactly one text body variable for the summary, for example: "Mane Bazaar order update: {{1}}. Open your seller app to review." Meta decides approval and classification.

Set its exact name in WHATSAPP_ORDER_TEMPLATE and language code in WHATSAPP_TEMPLATE_LANGUAGE. Match the template language to the seller's preference. The adapter cannot grant template approval.

Without a template, the alert stays blocked with an outbox explanation. Alerts older than 23 hours expire; the app remains authoritative. A current seller message releases current blocked messages as text. Failed or uncertain sends are not blindly retried.

Signatures are checked on raw webhook bytes. Duplicate IDs do not repeat mutations or notifications. Provider sent/delivered/read/failed receipts update the outbox without downgrading stronger delivery evidence. A send response does not prove phone delivery. Customer numbers are not collected or messaged.

## Optional voice

Create a Sarvam account/API key and add credits if needed. Put SARVAM_API_KEY in host secrets; set SARVAM_MODEL=saaras:v3 and VOICE_ENABLED=true. Leave disabled until ready to send audio to that provider.

Use notes under 30 seconds. The adapter retrieves Meta audio, restricts download hosts, refuses redirects, limits media to 8 MiB and sends it to Sarvam with automatic language detection. Kannada, English and Hindi are documented provider languages. Audio stays in memory, while transcripts are retained in the seller inbox. Meta/Sarvam process audio under their own policies.

The transcript is shown back and may create a constrained chakli/peda draft. Check quantity, price and pack size; explicitly confirm by text. Spoken CONFIRM/ACCEPT/READY cannot change the business. Unsupported products require the form. Failures ask for shorter audio/text; interrupted processing is not blindly retried.

Recognition accuracy in Hubballi accents and noisy kitchens has not been tested. All provider responses in automated tests are mocked.

## Official references checked on 2026-10-07

- Meta Cloud API: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- Webhooks: https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference
- Templates: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/
- Media: https://www.postman.com/meta/whatsapp-business-platform/request/fpj02x0/retrieve-media-url
- Sarvam transcription: https://docs.sarvam.ai/api-reference/speech-to-text/transcribe

Check actual eligibility, charges and approval status in your account.
