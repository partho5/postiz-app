# Postiz Platform Integrations — Required Info

## Auth Types Legend
- **OAuth** — redirect-based login; requires app credentials in `.env`
- **Custom Fields** — form filled by user at connect time
- **Web3/Custom** — special in-app flow

---

## 1. X (Twitter)
- **Auth:** OAuth
- **Required `.env`:** `X_API_KEY`, `X_API_SECRET`, `X_URL` (optional, falls back to `FRONTEND_URL`)
- **User provides:** nothing (redirected to X login)
- **Notes:** Logs into currently-active X account. Optional `X_URL` override for callback.

---

## 2. LinkedIn (Personal)
- **Auth:** OAuth
- **Required `.env`:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- **User provides:** nothing (redirected to LinkedIn login)
- **Notes:** One-time token. Scopes include member social + org admin.

---

## 3. LinkedIn Page
- **Auth:** OAuth → page selection
- **Required `.env`:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- **User provides:** selects page from list of pages they admin
- **Notes:** `isBetweenSteps = true` — after OAuth, user picks which org page to connect.

---

## 4. Facebook Page
- **Auth:** OAuth → page selection
- **Required `.env`:** `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- **User provides:** selects Facebook Page from their account
- **Notes:** `isBetweenSteps = true` — after OAuth, user picks which FB Page.

---

## 5. Instagram (Facebook Business)
- **Auth:** OAuth via Facebook → Instagram account selection
- **Required `.env`:** `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- **User provides:** selects Instagram Business account linked to a Facebook Page
- **Notes:** `isBetweenSteps = true`. Instagram account must be a Business account connected to a Facebook Page.

---

## 6. Instagram (Standalone)
- **Auth:** OAuth via Instagram directly
- **Required `.env`:** `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`
- **User provides:** nothing (redirected to Instagram login)
- **Notes:** Uses `graph.instagram.com` instead of Facebook Graph. Requires HTTPS — uses `redirectmeto.com` proxy for HTTP dev environments.

---

## 7. TikTok
- **Auth:** OAuth
- **Required `.env`:** `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`
- **User provides:** nothing (redirected to TikTok login)
- **Notes:** Uses PKCE. Requires HTTPS — uses `redirectmeto.com` proxy for HTTP dev environments.

---

## 8. YouTube
- **Auth:** OAuth (Google)
- **Required `.env`:** `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
- **User provides:** nothing (redirected to Google login)
- **Notes:** Requests offline access + consent prompt to ensure refresh token.

---

## 9. Reddit
- **Auth:** OAuth
- **Required `.env`:** `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`
- **User provides:** nothing (redirected to Reddit login)
- **Notes:** Permanent duration token. Scopes: `read`, `identity`, `submit`, `flair`.

---

## 10. Pinterest
- **Auth:** OAuth
- **Required `.env`:** `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`
- **User provides:** nothing (redirected to Pinterest login)
- **Notes:** Scopes: boards read/write, pins read/write, user_accounts read.

---

## 11. Threads
- **Auth:** OAuth
- **Required `.env`:** `THREADS_APP_ID`, `THREADS_APP_SECRET`
- **User provides:** nothing (redirected to Threads login)
- **Notes:** Requires HTTPS — uses `redirectmeto.com` proxy for HTTP dev environments.

---

## 12. Discord
- **Auth:** OAuth (Bot install)
- **Required `.env`:** `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN_ID`
- **User provides:** selects which Discord server (guild) to install the bot into
- **Notes:** Installs a bot into the server. Bot token is used for posting. After connect, user selects a channel when composing posts.

---

## 13. Slack
- **Auth:** OAuth
- **Required `.env`:** `SLACK_ID`, `SLACK_SECRET`
- **User provides:** selects Slack workspace
- **Notes:** Requires HTTPS — uses `redirectmeto.com` proxy for HTTP dev environments. After connect, user selects a channel when composing posts.

---

## 14. Telegram
- **Auth:** Web3 / Custom bot flow
- **Required `.env`:** `TELEGRAM_TOKEN` (bot token)
- **User provides:** sends `/connect {code}` to the bot in the target group/channel
- **Notes:** `isWeb3 = true`. User adds the bot to their group/channel, then sends the connect command. Works with both public and private groups/channels.

---

## 15. VK (VKontakte)
- **Auth:** OAuth (PKCE)
- **Required `.env`:** `VK_ID`
- **User provides:** nothing (redirected to VK login)
- **Notes:** Requires HTTPS — uses `redirectmeto.com` proxy for HTTP dev environments. Scopes include wall, photos, video.

---

## 16. Medium
- **Auth:** Custom Fields (API Key)
- **Required `.env`:** none
- **User provides:**
  - `API key` — from Medium settings → Integration tokens
- **Notes:** Token stored permanently (no expiry). User picks publication when composing posts.

---

## 17. Dev.to
- **Auth:** Custom Fields (API Key)
- **Required `.env`:** none
- **User provides:**
  - `API key` — from dev.to settings → Extensions → DEV Community API keys
- **Notes:** Token stored permanently. User can pick organization/tags when composing.

---

## 18. Hashnode
- **Auth:** Custom Fields (API Key)
- **Required `.env`:** none
- **User provides:**
  - `API key` — from Hashnode account settings → Developer → Personal Access Tokens
- **Notes:** Token stored permanently. User picks publication when composing.

---

## 19. WordPress
- **Auth:** Custom Fields (credentials)
- **Required `.env`:** none
- **User provides:**
  - `Domain URL` — e.g. `https://myblog.com`
  - `Username` — WordPress username
  - `Password` — WordPress application password (not login password — must be generated in WP admin → Users → Application Passwords)
- **Notes:** Uses HTTP Basic Auth with WP REST API. Credentials encoded in token. User picks post type when composing.

---

## 20. Dribbble
- **Auth:** OAuth
- **Required `.env`:** `DRIBBBLE_CLIENT_ID`, `DRIBBBLE_CLIENT_SECRET`
- **User provides:** nothing (redirected to Dribbble login)
- **Notes:** Scopes: `public`, `upload`. Requires image attachment for every shot.

---

## 21. Lemmy
- **Auth:** Custom Fields (credentials)
- **Required `.env`:** none
- **User provides:**
  - `Service` — Lemmy instance URL (default: `https://lemmy.world`)
  - `Identifier` — username or email
  - `Password` — account password
- **Notes:** Credentials stored encrypted. Re-authenticates on each post. User searches/selects communities when composing.

---

## 22. Mastodon
- **Auth:** OAuth (fixed instance)
- **Required `.env`:** `MASTODON_URL` (default: `https://mastodon.social`), `MASTODON_CLIENT_ID`, `MASTODON_CLIENT_SECRET`
- **User provides:** nothing (redirected to the configured Mastodon instance)
- **Notes:** Tied to a single pre-configured Mastodon instance.

---

## 23. Mastodon Custom Instance (M. Instance)
- **Auth:** Custom Instance URL → OAuth
- **Required `.env`:** none (app is registered dynamically per instance)
- **User provides:**
  - `Instance URL` — e.g. `https://fosstodon.org`
- **Notes:** App is registered on-the-fly with the given instance. Then user is redirected to that instance for OAuth.

---

## 24. Bluesky
- **Auth:** Custom Fields (credentials)
- **Required `.env`:** none
- **User provides:**
  - `Service` — Bluesky PDS URL (default: `https://bsky.social`)
  - `Identifier` — handle or DID (e.g. `user.bsky.social`)
  - `Password` — App password (generate in Bluesky settings → Privacy and Security → App Passwords)
- **Notes:** Credentials stored encrypted and re-used on each post.

---

## 25. Farcaster / Warpcast
- **Auth:** Web3 / Neynar sign-in
- **Required `.env`:** `NEYNAR_SECRET_KEY`, `NEYNAR_CLIENT_ID`
- **User provides:** signs in via Neynar's Farcaster login widget in-app (QR code / wallet)
- **Notes:** `isWeb3 = true`. Uses `signer_uuid` from Neynar as access token. User can select Farcaster channels when composing.

---

## 26. Nostr
- **Auth:** Custom Fields (private key)
- **Required `.env`:** none
- **User provides:**
  - `Nostr private key` — hex-encoded 32-byte private key
- **Notes:** Key stored encrypted. Public key derived from private key. Posts broadcast to multiple relays (primal, damus, snort, etc.).

---

## 27. Google My Business (GMB)
- **Auth:** OAuth (Google) → location selection
- **Required `.env`:** `GOOGLE_GMB_CLIENT_ID` (falls back to `YOUTUBE_CLIENT_ID`), `GOOGLE_GMB_CLIENT_SECRET` (falls back to `YOUTUBE_CLIENT_SECRET`)
- **User provides:** selects business location from their GMB account
- **Notes:** `isBetweenSteps = true`. After OAuth, user picks which business location to connect.

---

## 28. Listmonk
- **Auth:** Custom Fields (credentials)
- **Required `.env`:** none
- **User provides:**
  - `URL` — self-hosted Listmonk instance URL (e.g. `https://newsletter.mysite.com`)
  - `Username` — Listmonk admin username
  - `Password` — Listmonk admin password
- **Notes:** Uses HTTP Basic Auth. Credentials stored encrypted. User selects mailing list and template when composing.

---

## Summary Table

| Platform | Auth Type | Env Vars Needed | User Input at Connect |
|---|---|---|---|
| X (Twitter) | OAuth | `X_API_KEY`, `X_API_SECRET` | None |
| LinkedIn | OAuth | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | None |
| LinkedIn Page | OAuth + page select | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Select page |
| Facebook Page | OAuth + page select | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Select page |
| Instagram (FB Business) | OAuth + account select | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Select IG account |
| Instagram (Standalone) | OAuth | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | None |
| TikTok | OAuth | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET` | None |
| YouTube | OAuth | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | None |
| Reddit | OAuth | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` | None |
| Pinterest | OAuth | `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` | None |
| Threads | OAuth | `THREADS_APP_ID`, `THREADS_APP_SECRET` | None |
| Discord | OAuth (bot install) | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN_ID` | Select server |
| Slack | OAuth | `SLACK_ID`, `SLACK_SECRET` | Select workspace |
| Telegram | Bot command | `TELEGRAM_TOKEN` | Send `/connect {code}` to bot |
| VK | OAuth | `VK_ID` | None |
| Medium | API Key | None | API key |
| Dev.to | API Key | None | API key |
| Hashnode | API Key | None | API key |
| WordPress | Credentials | None | Domain URL, Username, App Password |
| Dribbble | OAuth | `DRIBBBLE_CLIENT_ID`, `DRIBBBLE_CLIENT_SECRET` | None |
| Lemmy | Credentials | None | Instance URL, Username, Password |
| Mastodon | OAuth | `MASTODON_URL`, `MASTODON_CLIENT_ID`, `MASTODON_CLIENT_SECRET` | None |
| Mastodon Custom | Instance URL + OAuth | None | Instance URL |
| Bluesky | Credentials | None | Service URL, Identifier, App Password |
| Farcaster/Warpcast | Neynar Web3 | `NEYNAR_SECRET_KEY`, `NEYNAR_CLIENT_ID` | Neynar sign-in |
| Nostr | Private Key | None | Nostr private key (hex) |
| Google My Business | OAuth + location select | `GOOGLE_GMB_CLIENT_ID`, `GOOGLE_GMB_CLIENT_SECRET` | Select location |
| Listmonk | Credentials | None | URL, Username, Password |
