require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();

const API_BASE = "https://discord.com/api/v10";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const cache = new Map();

function getUserAvatar(user) {
  if (!user?.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

async function discordFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bot ${DISCORD_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord API ${res.status}: ${text}`);
  }

  return res.json();
}

async function fetchAllGuildMembers() {
  const allMembers = [];
  let after = "0";

  while (true) {
    const batch = await discordFetch(
      `/guilds/${GUILD_ID}/members?limit=1000&after=${after}`
    );

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    allMembers.push(...batch);
    after = batch[batch.length - 1].user.id;

    if (batch.length < 1000) {
      break;
    }
  }

  return allMembers;
}

app.get("/", (req, res) => {
  res.send("Watancraft Discord API is running");
});

app.get("/health", (req, res) => {
  res.json({
    apiRunning: true,
    mode: "discord-rest",
    guildConfigured: !!GUILD_ID,
    tokenConfigured: !!DISCORD_TOKEN,
    node: process.version,
  });
});

app.get("/team/:roleId", async (req, res) => {
  const { roleId } = req.params;
  const cacheKey = `team:${roleId}`;
  const now = Date.now();

  try {
    const cached = cache.get(cacheKey);

    if (cached && now - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }

    const members = await fetchAllGuildMembers();

    const filtered = members
      .filter((member) => Array.isArray(member.roles) && member.roles.includes(roleId))
      .map((member) => ({
        id: member.user.id,
        username: member.user.username,
        displayName: member.nick || member.user.global_name || member.user.username,
        avatar: getUserAvatar(member.user),
      }));

    cache.set(cacheKey, {
      timestamp: now,
      data: filtered,
    });

    res.json(filtered);
  } catch (error) {
    console.error("Route error:", error);
    res.status(500).json({
      error: "Failed to fetch role members",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
  console.log("Mode: Discord REST API with 24h cache");
});
