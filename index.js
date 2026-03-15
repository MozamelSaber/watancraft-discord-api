require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
app.use(cors());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

app.get("/team/:roleId", async (req, res) => {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.members.fetch();

    const role = await guild.roles.fetch(req.params.roleId);
    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }

    const members = role.members.map(member => ({
      id: member.user.id,
      username: member.user.username,
      displayName: member.displayName,
      avatar: member.user.displayAvatarURL({ size: 256 })
    }));

    res.json(members);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch role members" });
  }
});

client.once("ready", () => {
  const port = process.env.PORT || 10000;
  app.listen(port, () => {
    console.log(`API running on port ${port}`);
  });
});

client.login(process.env.MTM5OTE5NzkzMDc2MTYyMTY0Nw.GUtGse.SpKocplXJfEXao-mZXxcRSctCsHmxuyvITIE2U);
