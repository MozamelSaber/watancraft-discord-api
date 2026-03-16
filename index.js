require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Client, GatewayIntentBits, Events } = require("discord.js");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();

console.log("Starting Watancraft Discord API...");
console.log("Environment check:");
console.log("PORT:", PORT);
console.log("GUILD_ID:", GUILD_ID ? "OK" : "MISSING");
console.log("DISCORD_TOKEN:", DISCORD_TOKEN ? `OK (${DISCORD_TOKEN.length} chars)` : "MISSING");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

let botReady = false;

/* -------------------- ROUTES -------------------- */

app.get("/", (req, res) => {
  res.send("Watancraft Discord API is running");
});

app.get("/health", (req, res) => {
  res.json({
    apiRunning: true,
    discordReady: botReady,
    guildConfigured: !!GUILD_ID,
    userTag: client.user?.tag || null,
  });
});

app.get("/team/:roleId", async (req, res) => {
  try {
    console.log("Incoming /team request:", req.params.roleId);

    if (!botReady) {
      return res.status(503).json({ error: "Discord bot is still starting" });
    }

    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.roles.fetch();
    await guild.members.fetch();

    const role = guild.roles.cache.get(req.params.roleId);
    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }

    const members = role.members.map((member) => ({
      id: member.user.id,
      username: member.user.username,
      displayName: member.displayName,
      avatar: member.user.displayAvatarURL({ size: 128 }),
    }));

    console.log(`Returning ${members.length} members for role ${role.name}`);
    res.json(members);
  } catch (error) {
    console.error("Route error:", error);
    res.status(500).json({
      error: "Failed to fetch role members",
      details: error.message,
    });
  }
});

/* -------------------- EXPRESS -------------------- */

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

/* -------------------- DISCORD LOGS -------------------- */

client.on(Events.ClientReady, async (readyClient) => {
  try {
    console.log("Discord client ready");
    console.log(`Logged in as ${readyClient.user.tag}`);

    const guild = await client.guilds.fetch(GUILD_ID);
    console.log("Connected to guild:", guild.name);

    console.log("Fetching roles...");
    await guild.roles.fetch();
    console.log("Roles cached:", guild.roles.cache.size);

    console.log("Fetching members...");
    await guild.members.fetch();
    console.log("Members cached:", guild.members.cache.size);

    botReady = true;
    console.log("Discord bot is fully ready");
  } catch (error) {
    console.error("Startup error after ready:", error);
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error:", error);
});

client.on(Events.Warn, (info) => {
  console.warn("Discord warn:", info);
});

client.on(Events.Debug, (info) => {
  if (
    info.includes("Heartbeat acknowledged") ||
    info.includes("Sending a heartbeat")
  ) {
    return;
  }
  console.log("Discord debug:", info);
});

client.on("shardError", (error) => {
  console.error("Discord shard error:", error);
});

client.on("shardDisconnect", (event, shardId) => {
  console.warn(`Shard ${shardId} disconnected`, event?.code);
});

client.on("shardReconnecting", (shardId) => {
  console.warn(`Shard ${shardId} reconnecting`);
});

client.on("shardResume", (shardId) => {
  console.log(`Shard ${shardId} resumed`);
});

/* -------------------- LOGIN -------------------- */

(async () => {
  try {
    if (!DISCORD_TOKEN) {
      throw new Error("DISCORD_TOKEN is missing");
    }
    if (!GUILD_ID) {
      throw new Error("GUILD_ID is missing");
    }

    console.log("Attempting Discord login...");
    const loginResult = await client.login(DISCORD_TOKEN);
    console.log("client.login() resolved successfully");
    console.log("Login result length:", loginResult ? loginResult.length : 0);
  } catch (err) {
    console.error("Discord login failed:", err);
  }
})();
