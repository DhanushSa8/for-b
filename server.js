require("dotenv").config({ override: true });
const express = require("express");
const path = require("path");
const { promises: fs } = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;
const rawSecret = String(process.env.APP_SECRET || "").trim();
const APP_SECRET =
  rawSecret && rawSecret !== "change-this-secret" ? rawSecret : "";
const NOTIFY_WEBHOOK_URL = process.env.NOTIFY_WEBHOOK_URL || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const PHOTOS_DIR = path.join(__dirname, "public", "photos");
const MAX_VOICE_NOTE_BYTES = 12 * 1024 * 1024;

const cooldownMsByType = {
  call: 10000,
  mood: 3000,
  voice: 5000
};

const lastEventAt = {
  call: 0,
  mood: 0,
  voice: 0
};

app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function sendWebhookAlert(payload) {
  const notifyRes = await fetch(NOTIFY_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!notifyRes.ok) {
    const errBody = await notifyRes.text();
    throw new Error(`Webhook failed: ${notifyRes.status} ${errBody.slice(0, 300)}`);
  }
}

async function sendTelegramAlert(text) {
  const telegramRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text
      })
    }
  );

  if (!telegramRes.ok) {
    const errBody = await telegramRes.text();
    throw new Error(`Telegram failed: ${telegramRes.status} ${errBody.slice(0, 300)}`);
  }
}

async function sendTelegramAudioDocument({ buffer, mimeType, fileName, caption }) {
  const form = new FormData();
  form.append("chat_id", TELEGRAM_CHAT_ID);
  form.append("caption", caption);
  form.append(
    "document",
    new Blob([buffer], { type: mimeType || "application/octet-stream" }),
    fileName
  );

  const telegramRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
    {
      method: "POST",
      body: form
    }
  );

  if (!telegramRes.ok) {
    const errBody = await telegramRes.text();
    throw new Error(`Telegram file upload failed: ${telegramRes.status} ${errBody.slice(0, 300)}`);
  }
}

function ensureAuthorized(secret) {
  return !APP_SECRET || secret === APP_SECRET;
}

function safeText(value, fallback, maxLength) {
  return String(value || fallback).trim().slice(0, maxLength);
}

function checkCooldown(type) {
  const now = Date.now();
  const waitMs = cooldownMsByType[type] || 0;
  const lastAt = lastEventAt[type] || 0;

  if (now - lastAt < waitMs) {
    return {
      ok: false,
      retryAfterMs: waitMs - (now - lastAt)
    };
  }

  lastEventAt[type] = now;
  return { ok: true, retryAfterMs: 0 };
}

async function dispatchTextAlert(text) {
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    await sendTelegramAlert(text);
    return { via: "telegram" };
  }

  if (NOTIFY_WEBHOOK_URL) {
    await sendWebhookAlert({ text });
    return { via: "webhook" };
  }

  console.log("[Assistant Alert]", text);
  return {
    via: "server-log",
    note: "Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID for phone push notifications."
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/photos", async (_req, res) => {
  try {
    const entries = await fs.readdir(PHOTOS_DIR, { withFileTypes: true });
    const allowedExt = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => allowedExt.has(path.extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));

    return res.json({
      ok: true,
      photos: files.map((name) => `/photos/${encodeURIComponent(name)}`)
    });
  } catch (_error) {
    return res.json({ ok: true, photos: [] });
  }
});

app.post("/api/call-assistant", async (req, res) => {
  try {
    const { name, message, secret } = req.body || {};

    if (!ensureAuthorized(secret)) {
      return res.status(401).json({ ok: false, error: "Unauthorized request" });
    }

    const cooldown = checkCooldown("call");
    if (!cooldown.ok) {
      return res.status(429).json({
        ok: false,
        error: "Too many requests, please wait a few seconds.",
        retryAfterMs: cooldown.retryAfterMs
      });
    }

    const safeName = safeText(name, "Her", 50);
    const safeMessage = safeText(message, "Needs your help right now.", 180);
    const text = `Assistant Alert: ${safeName} pressed the help button. Message: ${safeMessage}`;
    const result = await dispatchTextAlert(text);

    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Unexpected server error",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/mood-checkin", async (req, res) => {
  try {
    const { name, mood, moodMessage, secret } = req.body || {};

    if (!ensureAuthorized(secret)) {
      return res.status(401).json({ ok: false, error: "Unauthorized request" });
    }

    const cooldown = checkCooldown("mood");
    if (!cooldown.ok) {
      return res.status(429).json({
        ok: false,
        error: "Too many requests, please wait a few seconds.",
        retryAfterMs: cooldown.retryAfterMs
      });
    }

    const moodMap = {
      happy: {
        label: "happy",
        emoji: "😊",
        defaultMessage: "I’m feeling happy and wanted to share it with you."
      },
      sad: {
        label: "sad",
        emoji: "😔",
        defaultMessage: "I’m feeling low right now. Please talk to me when free."
      },
      stressed: {
        label: "stressed",
        emoji: "😣",
        defaultMessage: "I’m feeling stressed. I need your calm voice."
      },
      angry: {
        label: "angry",
        emoji: "😠",
        defaultMessage: "I’m angry right now and need your support."
      },
      "thokolo-panchayti": {
        label: "thokolo panchayti",
        emoji: "🤭",
        defaultMessage: "I have a panchayti situation. I need you to hear me out."
      },
      "thokolo panchayti": {
        label: "thokolo panchayti",
        emoji: "🤭",
        defaultMessage: "I have a panchayti situation. I need you to hear me out."
      }
    };

    const moodKey = String(mood || "").toLowerCase();
    const chosenMood = moodMap[moodKey];

    if (!chosenMood) {
      return res.status(400).json({
        ok: false,
        error: "Mood must be one of: happy, sad, stressed, angry, thokolo panchayti."
      });
    }

    const safeName = safeText(name, "Bhaviiii", 50);
    const safeMoodMessage = safeText(
      moodMessage,
      chosenMood.defaultMessage,
      220
    );
    const text = `Mood Check-in: ${safeName} is feeling ${chosenMood.label} ${chosenMood.emoji}. Message: ${safeMoodMessage}`;
    const result = await dispatchTextAlert(text);

    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Unexpected server error",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/voice-note", async (req, res) => {
  try {
    const { name, secret, audioBase64, mimeType } = req.body || {};

    if (!ensureAuthorized(secret)) {
      return res.status(401).json({ ok: false, error: "Unauthorized request" });
    }

    const cooldown = checkCooldown("voice");
    if (!cooldown.ok) {
      return res.status(429).json({
        ok: false,
        error: "Too many requests, please wait a few seconds.",
        retryAfterMs: cooldown.retryAfterMs
      });
    }

    if (!audioBase64 || typeof audioBase64 !== "string") {
      return res.status(400).json({ ok: false, error: "Missing recorded audio." });
    }

    const safeName = safeText(name, "Bhaviiii", 50);
    const safeMimeType = safeText(mimeType, "audio/webm", 80).toLowerCase();
    const buffer = Buffer.from(audioBase64, "base64");

    if (!buffer.length) {
      return res.status(400).json({ ok: false, error: "Invalid audio payload." });
    }

    if (buffer.length > MAX_VOICE_NOTE_BYTES) {
      return res.status(413).json({
        ok: false,
        error: "Voice note is too large. Keep it under 12 MB."
      });
    }

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      let ext = "webm";
      if (safeMimeType.includes("ogg")) ext = "ogg";
      if (safeMimeType.includes("mpeg") || safeMimeType.includes("mp3")) ext = "mp3";
      if (safeMimeType.includes("mp4") || safeMimeType.includes("m4a")) ext = "m4a";

      await sendTelegramAudioDocument({
        buffer,
        mimeType: safeMimeType,
        fileName: `voice-note-${Date.now()}.${ext}`,
        caption: `Voice note from ${safeName}`
      });

      return res.json({ ok: true, via: "telegram" });
    }

    const text = `Voice note received from ${safeName}, but Telegram is not configured for audio delivery.`;
    const result = await dispatchTextAlert(text);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Unexpected server error",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
