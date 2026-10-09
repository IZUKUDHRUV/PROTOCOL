# What Did I Miss?

A responsive catch-up assistant for unread conversations. It summarizes what changed, highlights decisions and direct mentions, surfaces tasks and deadlines, and keeps original message evidence close to each summary.

## Run locally

Prerequisite: Node.js 20 or later.

```powershell
cd C:\vscode
npm install
npm run install:all
npm run dev
```

Open http://localhost:5173. The interface starts with clearly labeled sample conversations stored in page memory. Sample data is not sent to the backend; it resets after a page reload. Refresh and browse the dashboard without provider credentials.

## Current provider support

- **WhatsApp Business Platform:** Backend webhook verification and inbound text-message handling are implemented on the isolated webhook listener at port 3002. Requires Meta app credentials, a Business Platform phone number, and a publicly reachable HTTPS callback. This is not access to a personal WhatsApp inbox.
- **WhatsApp text export:** Personal chats can be imported from a WhatsApp-exported `.txt` file. The file is parsed locally in the browser (maximum 1 MB), is not uploaded, and receives a “Needs review” notice rather than an invented summary.
- **Telegram Bot API:** Secret-token-verified webhook receiver is implemented on the backend. Requires a bot and publicly reachable HTTPS endpoint.
- **Slack:** The integration card and provider status are scaffolding only. OAuth installation, event subscriptions, and request signature verification are not implemented.
- **Email:** The integration card and provider status are scaffolding only. Gmail/Microsoft OAuth and mailbox sync are not implemented.
- **Android notifications:** A separate Android companion source exists. Notification-listener consent, HTTPS forwarding, and device setup are required; it has not been device-tested here.

The sample Slack, WhatsApp, Telegram, and Email conversations are mock providers for the UI only. They do not represent connected accounts. The dashboard displays backend status separately from sample data. Samples work when the API server is offline.

## Backend configuration

Copy `.env.example` to `server/.env` and fill in provider values on your machine. Never put provider keys or tokens into frontend code or commit a populated env file.

- `META_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` protect the WhatsApp webhook.
- `TELEGRAM_WEBHOOK_SECRET` protects Telegram webhook requests.
- `GENERIC_WEBHOOK_SECRET` protects generic normalized message submissions.
- `GEMINI_API_KEY` plus `GEMINI_CLOUD_ANALYSIS_CONSENT=true` enable server-side Gemini analysis. Cloud analysis is disabled unless both are set.
- `COMPANION_AUTH_SECRET` protects the Android companion ingestion endpoint.
- Slack and email OAuth secrets are not used yet because those adapters are scaffolding only.

The dashboard API listens on port 3001. The separate WhatsApp listener listens on port 3002 and exposes only `/webhooks/whatsapp`; do not tunnel the dashboard API publicly. Configure Meta's callback as `https://YOUR_HTTPS_HOST/webhooks/whatsapp`, set the same verify token in Meta, and subscribe to inbound message events. Verify Meta's current setup requirements before deploying.

## Privacy and data behavior

- Sample conversations stay in browser memory and are labeled as examples.
- Real webhook messages are kept in the backend's bounded in-memory store; they are not persisted by default.
- Gemini processing sends message content to Google's API only when the server API key and cloud-consent environment flag are enabled.
- Integration setup cards explain permissions and never request provider secrets in the browser.
- Delete a conversation from its detail panel, or delete all current conversations in Privacy & settings.
- Summaries show their source and generation time. Inferences without direct evidence should be treated cautiously.

## API surface

- `GET /api/state` returns messages, tasks, and deadlines.
- `GET /api/integrations` reports provider setup and receiving status.
- `GET /api/events` streams new analyses to the dashboard.
- `GET /webhooks/whatsapp` and `POST /webhooks/whatsapp` handle Meta verification and events on port 3002.
- `POST /webhook/telegram` receives Telegram bot updates on the isolated listener.
- `POST /api/companion/events` accepts authenticated Android notification events.
- `POST /webhook/generic` accepts bearer-authenticated normalized message submissions.

## Build and tests

```powershell
npm test
npm run build
```
