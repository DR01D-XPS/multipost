# Multi-channel Post Studio

Multi-channel post drafting, previewing, and scheduled publishing for VK groups, Telegram channels, and MAX chats.

## Stack

- PNPM workspaces monorepo
- Next.js App Router + TypeScript + Tailwind
- Prisma + Postgres
- BullMQ + Redis
- TipTap editor
- Local filesystem storage in development

## Quick start

Prerequisites:

- Docker Desktop or Docker Engine with Compose
- Node.js 20+
- PNPM 9+

1. Copy `.env.example` to `.env` and replace the secrets.
2. Start the full dev stack:

```bash
docker compose up --build
```

The app will be available at `http://localhost:3000`.

## Local scripts

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
pnpm worker
```

## Required env vars

- `DATABASE_URL`
- `REDIS_URL`
- `APP_BASE_URL`
- `AUTH_ADMIN_USERNAME`
- `AUTH_ADMIN_PASSWORD`
- `AUTH_COOKIE_SECRET`
- `CHANNEL_CONFIG_SECRET`
- `STORAGE_ROOT`
- `TELEGRAM_DEFAULT_PARSE_MODE`
- `MAX_DEFAULT_FORMAT`
- `VK_API_VERSION`
- `VK_PUBLISH_TRANSPORT`
- `VK_GLOBAL_ACCESS_TOKEN` (optional, global override for all VK channels)
- `VK_ID_CLIENT_ID` (optional, for one-click VK ID OAuth in Channels UI)
- `VK_ID_REDIRECT_URI` (optional, defaults to `${APP_BASE_URL}/vk/callback`)
- `VK_ID_SCOPE` (optional, default: `email phone`)
- `VK_PLAYWRIGHT_LOGIN` (optional for Playwright mode)
- `VK_PLAYWRIGHT_PASSWORD` (optional for Playwright mode)
- `VK_PLAYWRIGHT_STORAGE_STATE_PATH` (optional)
- `VK_PLAYWRIGHT_HEADLESS` (optional)
- `VK_PLAYWRIGHT_USER_AGENT` (optional)

## Auth

The app uses a single admin login backed by environment variables. Credentials are never stored in the database for the MVP.

## Channels

### Telegram

1. Create a bot with `@BotFather`.
2. Add the bot to your target channel.
3. Promote the bot to admin with permission to post.
4. Save `botToken` and `chatId` in the Channels UI.

### Telegram custom emoji packs

1. Open a custom emoji pack in Telegram.
2. Copy its link in the format `https://t.me/addemoji/<set_name>`.
3. If you do not want to paste the full URL, you can use only the short name, for example `mathsymbols`.
4. In `/channels`, open the `Telegram emoji` section.
5. Select any Telegram channel or bot that is already connected in the app.
6. Paste the `t.me/addemoji/...` link or short name and click `Import pack`.
7. The app will cache the pack locally and show it in the post editor under the `TG Emoji` button.

Notes:

- The app imports only packs with `sticker_type = custom_emoji`.
- Imported packs are stored locally in the database so they can be reused from the editor panel.
- In Telegram channel posts, custom emoji require a bot with additional usernames on Fragment. Otherwise Telegram will show the ordinary fallback emoji.
- On MAX and VK these emoji fall back to the ordinary base emoji.

Where to get the link:

- If someone sent you a pack link, it usually already looks like `https://t.me/addemoji/<set_name>`.
- In Telegram Desktop, open the pack and use the share or copy-link action.
- In the mobile app, open the pack and use the share menu to copy the link.
- If Telegram opens the pack page, the last path segment after `addemoji/` is the short name that can also be pasted into the app.

Examples:

- `https://t.me/addemoji/mathsymbols`
- `mathsymbols`

### MAX

1. Create a bot and generate an API token in MAX.
2. Add the bot to the target chat or channel.
3. Save the access token and target `chatId`.

### VK

1. Note the numeric group id.
2. Save group id in the Channels UI.
3. If you publish with VK API (`VK_PUBLISH_TRANSPORT=API`), use a `user access token` of a community admin.
4. You can set `VK_GLOBAL_ACCESS_TOKEN` in `.env` to force one global token for all VK channels.
5. If you publish with Playwright (`AUTO`/`PLAYWRIGHT`), token can stay empty in channel config.

VK ID OAuth helper in Channels UI:

1. Set `VK_ID_CLIENT_ID` to your VK ID app id.
2. Set `VK_ID_REDIRECT_URI` to the callback URL registered in VK ID app settings (for example `https://your-domain/vk/callback`).
3. Open `/channels` and in VK channel form click `Получить через VK ID` near access token.
4. Complete VK ID auth in popup; token is returned and auto-filled into the token field.

Important:

- A community/group token is not enough for `wall.post` in API mode.
- If VK returns `method is unavailable with group auth`, use user token or switch to Playwright transport.
- You can switch transport with `VK_PUBLISH_TRANSPORT`:
  - `API`: VK API upload + `wall.post`.
  - `AUTO`: API first, then fallback to Playwright on auth/permission API errors.
  - `PLAYWRIGHT`: publish through VK web UI automation only.

Playwright setup (only for `AUTO` or `PLAYWRIGHT`):

1. Set `VK_PLAYWRIGHT_LOGIN` and `VK_PLAYWRIGHT_PASSWORD`.
2. Install Playwright browser:

```bash
pnpm --filter @multipost/connectors exec playwright install chromium
```

3. First successful run will save session to `VK_PLAYWRIGHT_STORAGE_STATE_PATH`.
4. If VK asks for 2FA/captcha, complete it once in the opened browser session.

Docker note:

- If you run through Docker Compose, use:

```bash
docker compose exec web pnpm --filter @multipost/connectors exec playwright install chromium
```

- Set `PLAYWRIGHT_BROWSERS_PATH=.data/ms-playwright` so both `web` and `worker` reuse the same browser binaries.

## E2E sanity flow

1. Log in with the admin credentials from `.env`.
2. Add at least one channel and run `Test channel`.
3. Create a draft from `/posts`.
4. Edit the content, upload media (photo/GIF/video), reorder it if needed, and save.
5. Use the live preview on the right to switch between Telegram, MAX, and VK output.
6. In the right sidebar, choose `Publish now` or `Schedule` per channel.
7. Check the publish status on the post page or in the posts list.

## Notes

- Channel credentials are encrypted at rest with AES-GCM using `CHANNEL_CONFIG_SECRET`.
- Uploaded media is stored under `STORAGE_ROOT`.
- The MAX upload payload shape is isolated behind a connector so it can be refined if your tenant returns a slightly different response format.
- VK media publishing is implemented with the standard wall photo upload flow.
