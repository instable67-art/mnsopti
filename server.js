console.log('SERVER.JS LANCÉ');

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Client, GatewayIntentBits, ChannelType, PermissionsBitField, EmbedBuilder } from 'discord.js';

const {
  DISCORD_TOKEN,
  GUILD_ID,
  TICKETS_CATEGORY_ID,
  STAFF_ROLE_ID,
  PORT = 3000,
  SITE_ORIGIN
} = process.env;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN manquant');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`🤖 Bot connecté : ${client.user.tag}`);
});


await client.login(DISCORD_TOKEN);

const app = express();
app.use(helmet());
app.use(express.json({ limit: '50kb' }));
app.use(cors({ origin: SITE_ORIGIN, methods: ['POST'], allowedHeaders: ['Content-Type'] }));
app.use(rateLimit({ windowMs: 60000, max: 30 }));

app.listen(PORT, () => {
  console.log(`🌐 API en ligne sur http://localhost:${PORT}`);
});

