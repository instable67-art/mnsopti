console.log("SERVER.JS LANCÉ");

import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
} from "discord.js";

const {
  DISCORD_TOKEN,
  GUILD_ID,
  TICKETS_CATEGORY_ID,
  STAFF_ROLE_ID,
  STAFF_ROLE_ID_2, // ✅ deuxième rôle staff (optionnel)
  PORT = 3000,
  SITE_ORIGIN, // ex: https://instable67-art.github.io
} = process.env;

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN manquant");
  process.exit(1);
}
if (!GUILD_ID) console.warn("⚠️ GUILD_ID manquant");
if (!TICKETS_CATEGORY_ID) console.warn("⚠️ TICKETS_CATEGORY_ID manquant");
if (!STAFF_ROLE_ID) console.warn("⚠️ STAFF_ROLE_ID manquant");

// ---------- Discord Client ----------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`🤖 Bot connecté : ${client.user.tag}`);
});

client.login(DISCORD_TOKEN).catch((err) => {
  console.error("❌ Erreur login Discord:", err);
});

// ---------- Express API ----------
const app = express();

app.use(helmet());
app.use(express.json({ limit: "50kb" }));

// ✅ CORS
app.use(
  cors({
    origin: SITE_ORIGIN ? SITE_ORIGIN : true, // si vide -> autorise tout (test)
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.options("*", cors());

app.use(rateLimit({ windowMs: 60_000, max: 30 }));

// ---------- Health routes ----------
app.get("/", (req, res) => res.send("OK"));

app.get("/status", (req, res) => {
  res.json({
    online: true,
    botReady: client.isReady(),
    originAllowed: SITE_ORIGIN || "ANY",
  });
});

// ---------- Helpers ----------
function makeTicketId() {
  return "MNS-" + Math.random().toString(36).slice(2, 10).toUpperCase();
}
function safeChannelName(pseudo, ticketId) {
  const safePseudo =
    String(pseudo)
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "")
      .slice(0, 16) || "user";
  return `ticket-${safePseudo}-${ticketId.toLowerCase()}`.slice(0, 95);
}

// ---------- Ticket endpoint ----------
app.post("/api/ticket", async (req, res) => {
  try {
    const { pseudo, contact, subject, details } = req.body || {};

    if (!pseudo || !subject || !details) {
      return res.status(400).json({ ok: false, error: "Champs manquants" });
    }

    if (!client.isReady()) {
      return res.status(503).json({
        ok: false,
        error: "Bot Discord pas prêt (réessaie dans quelques secondes)",
      });
    }

    if (!GUILD_ID || !TICKETS_CATEGORY_ID || !STAFF_ROLE_ID) {
      return res.status(500).json({
        ok: false,
        error: "Config manquante (GUILD_ID / TICKETS_CATEGORY_ID / STAFF_ROLE_ID)",
      });
    }

    const guild = await client.guilds.fetch(GUILD_ID);

    // ✅ Vérifie que la catégorie existe
    const category = await guild.channels.fetch(TICKETS_CATEGORY_ID).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
      return res.status(500).json({
        ok: false,
        error: "TICKETS_CATEGORY_ID invalide (pas une catégorie)",
      });
    }

    const ticketId = makeTicketId();
    const channelName = safeChannelName(pseudo, ticketId);

    // ✅ Permissions : tout le monde caché, staff visible, bot visible
    const overwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: STAFF_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks,
        ],
      },
      // bot lui-même
      {
        id: client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
        ],
      },
    ];

    // ✅ 2e rôle staff si fourni
    if (STAFF_ROLE_ID_2) {
      overwrites.push({
        id: STAFF_ROLE_ID_2,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.EmbedLinks,
        ],
      });
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: TICKETS_CATEGORY_ID,
      topic: `Ticket ${ticketId} • Pseudo: ${pseudo} • Contact: ${contact || "—"} • Sujet: ${subject}`,
      permissionOverwrites: overwrites,
    });

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Nouveau ticket • ${ticketId}`)
      .addFields(
        { name: "Pseudo", value: String(pseudo).slice(0, 100), inline: true },
        { name: "Contact", value: (contact ? String(contact) : "—").slice(0, 100), inline: true },
        { name: "Sujet", value: String(subject).slice(0, 256) },
        { name: "Détails", value: String(details).slice(0, 1024) }
      )
      .setFooter({ text: "MNS OPTI" })
      .setTimestamp(new Date());

    const staffMentions = [`<@&${STAFF_ROLE_ID}>`];
    if (STAFF_ROLE_ID_2) staffMentions.push(`<@&${STAFF_ROLE_ID_2}>`);

    await channel.send({
      content: `${staffMentions.join(" ")} Ticket créé ✅`,
      embeds: [embed],
    });

    return res.json({
      ok: true,
      id: ticketId,
      channelUrl: `https://discord.com/channels/${GUILD_ID}/${channel.id}`,
    });
  } catch (e) {
    console.error("❌ /api/ticket error:", e);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
});

// ---------- Listen ----------
app.listen(Number(PORT), () => {
  console.log(`🌐 API en ligne sur le port ${PORT}`);
});
