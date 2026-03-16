require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

let botReady = false;

app.get("/", (req, res) => {
  res.send("Watancraft Discord API is running");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    discordReady: botReady,
  });
});

app.get("/team/:roleId", async (req, res) => {
  try {
    if (!botReady) {
      return res.status(503).json({ error: "Discord bot is still starting" });
    }

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
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

// Start web server immediately for Render
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});

// Discord startup in background
client.once("clientReady", async () => {
  try {
    console.log(`Logged in as ${client.user.tag}`);

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    console.log(`Connected to guild: ${guild.name}`);

    console.log("Caching guild members...");
    await guild.members.fetch();
    console.log(`Cached ${guild.members.cache.size} members`);

    botReady = true;
    console.log("Discord bot is ready");
  } catch (error) {
    console.error("Startup error:", error);
  }
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error("Discord login failed:", err);
});
