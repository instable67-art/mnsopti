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
// Routes de test (OBLIGATOIRE pour le site)
app.get("/", (req, res) => {
  res.send("OK");
});

app.get("/status", (req, res) => {
  res.json({ online: true });
});
app.use(express.json()); // si pas déjà présent

app.post("/api/ticket", async (req, res) => {
  try {
    const { pseudo, contact, subject, details } = req.body || {};

    if (!pseudo || !subject || !details) {
      return res.status(400).json({ ok: false, error: "Champs manquants" });
    }

    // ⚠️ ICI tu dois appeler ton bot Discord pour envoyer le ticket
    // Pour l’instant on répond juste OK pour tester
    const id = "MNS-" + Math.random().toString(36).slice(2, 10).toUpperCase();

    return res.json({ ok: true, id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 API en ligne sur http://localhost:${PORT}`);
});

