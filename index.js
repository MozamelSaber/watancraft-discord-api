require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();

const API_BASE = "https://discord.com/api/v10";
const CACHE_FILE = path.join(__dirname, "team-cache.json");
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function now() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getUserAvatar(user) {
  if (!user?.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

function readCacheFile() {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return {
        timestamp: 0,
        members: [],
        roles: {},
      };
    }

    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);

    return {
      timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : 0,
      members: Array.isArray(parsed.members) ? parsed.members : [],
      roles: parsed.roles && typeof parsed.roles === "object" ? parsed.roles : {},
    };
  } catch (error) {
    console.error("Failed to read cache file:", error);
    return {
      timestamp: 0,
      members: [],
      roles: {},
    };
  }
}

function writeCacheFile(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to write cache file:", error);
  }
}

function isCacheFresh(cache) {
  return cache.timestamp > 0 && now() - cache.timestamp < CACHE_TTL;
}

async function discordFetch(pathname) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    headers: {
      Authorization: `Bot ${DISCORD_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("retry-after");
    let retrySeconds = retryAfterHeader ? Number(retryAfterHeader) : 0;

    let bodyText = "";
    try {
      bodyText = await response.text();
      const parsed = JSON.parse(bodyText);
      if (!retrySeconds && typeof parsed.retry_after === "number") {
        retrySeconds = parsed.retry_after;
      }
    } catch {
      // ignore
    }

    throw new Error(
      `Discord API 429. Retry after ${retrySeconds || "unknown"} seconds.`
    );
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(`Discord API ${response.status}: ${bodyText}`);
  }

  return response.json();
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

    await sleep(1000);
  }

  return allMembers;
}

function buildRoleIndex(members) {
  const roles = {};

  for (const member of members) {
    if (!Array.isArray(member.roles)) continue;

    const shapedMember = {
      id: member.user.id,
      username: member.user.username,
      displayName: member.nick || member.user.global_name || member.user.username,
      avatar: getUserAvatar(member.user),
    };

    for (const roleId of member.roles) {
      if (!roles[roleId]) roles[roleId] = [];
      roles[roleId].push(shapedMember);
    }
  }

  return roles;
}

let refreshPromise = null;

async function refreshCache(force = false) {
  const existing = readCacheFile();

  if (!force && isCacheFresh(existing)) {
    return existing;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      console.log("Refreshing Discord member cache...");

      const members = await fetchAllGuildMembers();
      const roles = buildRoleIndex(members);

      const newCache = {
        timestamp: now(),
        members,
        roles,
      };

      writeCacheFile(newCache);

      console.log(
        `Cache refreshed successfully. Members: ${members.length}, roles indexed: ${Object.keys(roles).length}`
      );

      return newCache;
    } catch (error) {
      console.error("Cache refresh failed:", error);

      const fallback = readCacheFile();
      if (fallback.timestamp > 0) {
        console.log("Serving stale cache because refresh failed.");
        return fallback;
      }

      throw error;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function ensureInitialCache() {
  try {
    const cache = readCacheFile();

    if (isCacheFresh(cache)) {
      console.log("Existing cache is fresh. Skipping startup refresh.");
      return;
    }

    await refreshCache(true);
  } catch (error) {
    console.error("Initial cache warmup failed:", error);
  }
}

app.get("/", (req, res) => {
  res.send("Watancraft Discord API is running");
});

app.get("/health", (req, res) => {
  const cache = readCacheFile();

  res.json({
    apiRunning: true,
    mode: "discord-rest-file-cache",
    guildConfigured: !!GUILD_ID,
    tokenConfigured: !!DISCORD_TOKEN,
    node: process.version,
    cacheFresh: isCacheFresh(cache),
    cacheAgeSeconds: cache.timestamp
      ? Math.floor((now() - cache.timestamp) / 1000)
      : null,
    cachedMembers: Array.isArray(cache.members) ? cache.members.length : 0,
    indexedRoles: cache.roles ? Object.keys(cache.roles).length : 0,
  });
});

app.get("/team/:roleId", async (req, res) => {
  try {
    const cache = await refreshCache(false);
    const roleMembers = cache.roles?.[req.params.roleId] || [];
    res.json(roleMembers);
  } catch (error) {
    console.error("Team route error:", error);
    res.status(500).json({
      error: "Failed to fetch role members",
      details: error.message,
    });
  }
});

app.post("/refresh", async (req, res) => {
  const adminKey = (process.env.ADMIN_REFRESH_KEY || "").trim();
  const providedKey = (req.headers["x-admin-key"] || "").toString().trim();

  if (!adminKey || providedKey !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const cache = await refreshCache(true);
    res.json({
      ok: true,
      refreshed: true,
      cachedMembers: cache.members.length,
      indexedRoles: Object.keys(cache.roles).length,
      timestamp: cache.timestamp,
    });
  } catch (error) {
    console.error("Manual refresh error:", error);
    res.status(500).json({
      error: "Failed to refresh cache",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
  console.log("Mode: Discord REST API with file cache");
  ensureInitialCache();

  setInterval(() => {
    refreshCache(false).catch((error) => {
      console.error("Scheduled refresh error:", error);
    });
  }, 60 * 60 * 1000);
});
