require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Client, GatewayIntentBits, Events } = require("discord.js");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

let botReady = false;
let tokenCheck = null;

app.get("/", (req, res) => {
  res.send("Watancraft Discord API is running");
});

app.get("/health", (req, res) => {
  res.json({
    apiRunning: true,
    discordReady: botReady,
    userTag: client.user?.tag || null,
    node: process.version,
    tokenCheck,
  });
});

app.get("/team/:roleId", async (req, res) => {
  try {
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

    res.json(members);
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
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  botReady = true;
  console.log("Discord bot is fully ready");
});

client.on(Events.Error, (err) => {
  console.error("Discord client error:", err);
});

client.on("shardError", (err) => {
  console.error("Shard error:", err);
});

client.on("shardDisconnect", (event, id) => {
  console.error(`Shard ${id} disconnected with code ${event?.code}`);
});

client.on("shardReconnecting", (id) => {
  console.log(`Shard ${id} reconnecting`);
});

async function verifyToken() {
  try {
    console.log("Checking bot token with Discord REST API...");

    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
      },
    });

    const data = await res.json().catch(() => ({}));

    tokenCheck = {
      ok: res.ok,
      status: res.status,
      username: data?.username || null,
      id: data?.id || null,
      message: data?.message || null,
    };

    console.log("Token check result:", tokenCheck);
  } catch (error) {
    tokenCheck = {
      ok: false,
      status: 0,
      username: null,
      id: null,
      message: error.message,
    };
    console.error("Token check failed:", error);
  }
}

(async () => {
  try {
    if (!DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is missing");
    if (!GUILD_ID) throw new Error("GUILD_ID is missing");

    await verifyToken();

    console.log("Attempting Discord login...");
    await client.login(DISCORD_TOKEN);
    console.log("client.login() resolved");
  } catch (err) {
    console.error("Discord login failed:", err);
  }
})();
