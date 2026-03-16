require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;

console.log("Starting Watancraft Discord API...");
console.log("Environment check:");
console.log("PORT:", PORT);
console.log("GUILD_ID:", process.env.GUILD_ID ? "OK" : "MISSING");
console.log("DISCORD_TOKEN:", process.env.DISCORD_TOKEN ? "OK" : "MISSING");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

let botReady = false;

/* -------------------------------- */
/* BASIC ROUTES */
/* -------------------------------- */

app.get("/", (req, res) => {
  res.send("Watancraft Discord API is running");
});

app.get("/health", (req, res) => {
  res.json({
    apiRunning: true,
    discordReady: botReady,
    guildConfigured: !!process.env.GUILD_ID,
  });
});

/* -------------------------------- */
/* TEAM ROUTE */
/* -------------------------------- */

app.get("/team/:roleId", async (req, res) => {
  try {
    console.log("Incoming team request:", req.params.roleId);

    if (!botReady) {
      console.log("Discord bot not ready yet");
      return res.status(503).json({
        error: "Discord bot is still starting",
      });
    }

    const guild = await client.guilds.fetch(process.env.GUILD_ID);

    if (!guild) {
      console.error("Guild not found");
      return res.status(500).json({
        error: "Guild not found",
      });
    }

    await guild.roles.fetch();
    await guild.members.fetch();

    const role = guild.roles.cache.get(req.params.roleId);

    if (!role) {
      console.error("Role not found:", req.params.roleId);
      return res.status(404).json({
        error: "Role not found",
      });
    }

    console.log("Role found:", role.name);
    console.log("Members in role:", role.members.size);

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

/* -------------------------------- */
/* START EXPRESS SERVER */
/* -------------------------------- */

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

/* -------------------------------- */
/* DISCORD BOT STARTUP */
/* -------------------------------- */

client.once("clientReady", async () => {
  try {
    console.log("Discord client ready");
    console.log(`Logged in as ${client.user.tag}`);

    const guild = await client.guilds.fetch(process.env.GUILD_ID);

    if (!guild) {
      console.error("Guild fetch failed");
      return;
    }

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
    console.error("Startup error:", error);
  }
});

/* -------------------------------- */
/* LOGIN */
/* -------------------------------- */

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("Discord login failed:", err);
});
