require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 10000;
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || "").trim();

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

let botReady = false;

app.get("/", (req, res) => {
  res.send("API is running");
});

app.get("/health", (req, res) => {
  res.json({
    apiRunning: true,
    discordReady: botReady,
    userTag: client.user?.tag || null,
    node: process.version,
  });
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  botReady = true;
  console.log("Bot ready");
});

client.on("error", (err) => {
  console.error("Client error:", err);
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

(async () => {
  try {
    console.log("Attempting Discord login...");
    await client.login(DISCORD_TOKEN);
    console.log("client.login() resolved");
  } catch (err) {
    console.error("Discord login failed:", err);
  }
})();
