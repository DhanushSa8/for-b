# Personal Assistant Website

A romantic mini website where she presses a button and you get notified.

Current features:

- One-tap assistant alert
- Mood check-in buttons (`happy`, `sad`, `stressed`, `angry`, `thokolo panchayti`)
- Random love note on each website open
- Voice note recording from browser and delivery to Telegram
- Full-screen background photo slideshow from your uploads

## 1) Install and run

```bash
npm install
cp .env.example .env
npm start
```

Open: `http://localhost:3000`

## 2) Configure notifications

Set these in `.env`:

- `TELEGRAM_BOT_TOKEN`: bot token from BotFather (recommended for phone push)
- `TELEGRAM_CHAT_ID`: your personal chat id
- `NOTIFY_WEBHOOK_URL`: webhook URL where you want to receive alerts (Discord, Slack, Make, Zapier, custom endpoint, etc.)
- `APP_SECRET`: shared secret to reduce unauthorized calls.

Notification priority:

1. Telegram (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`)
2. Webhook (`NOTIFY_WEBHOOK_URL`)
3. Server logs fallback

### Telegram setup (for real phone notifications)

1. Install Telegram app on your phone and enable notifications.
2. In Telegram, message `@BotFather` and run `/newbot` to create a bot.
3. Copy bot token and set `TELEGRAM_BOT_TOKEN` in `.env`.
4. Send one message to your new bot from your own Telegram account.
5. Open this URL in browser (replace token):  
   `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
6. Find `"chat":{"id":...}` in the JSON and copy that value into `TELEGRAM_CHAT_ID`.

## 3) Make it yours

Edit:

- `public/index.html` for the message and labels
- `public/styles.css` for colors and look
- `public/script.js` if you want extra fields or behavior
- `public/love-theme.mp3` add your music track (the page auto-plays this file)
- `public/photos/` add any photo files (`.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`) for slideshow

## 4) Voice Notes

- Browser will ask for microphone access; allow it.
- Voice notes are uploaded to Telegram as a document attachment.
- Max voice note size: 12 MB per recording.

## 5) Deploy Public Link (Render)

This gives you one shareable HTTPS link she can open from anywhere.

1. Push this project to a GitHub repository.
2. Go to [Render](https://render.com), then click `New +` -> `Blueprint`.
3. Connect your repo and deploy.
4. Render will read `/render.yaml` automatically.
5. In Render service environment variables, set:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
   - `APP_SECRET` (optional, leave empty unless you also set same value in frontend code)
   - `NOTIFY_WEBHOOK_URL` (optional)
6. After deploy, copy your URL (example: `https://bhaviiii-assistant.onrender.com`) and share it.

Notes:
- Voice note recording needs HTTPS in browser (Render URL already provides HTTPS).
- If you update code later, push to GitHub and Render auto-redeploys.

## Example webhook targets

- Discord incoming webhook
- Slack incoming webhook
- Zapier catch webhook
- Make.com webhook
