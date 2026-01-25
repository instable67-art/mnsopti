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
  PORT = 3000,
  SITE_ORIGIN, // ex: https://instable67-art.github.io

  // IDs (mets-les en Environment sur Render idéalement)
  GUILD_ID = "1456686776927260672",
  TICKETS_CATEGORY_ID = "1464951181645451400",
  STAFF_ROLE_ID = "1456688625830858813",
  STAFF_ROLE_ID_2 = "1456688866177187882",
} = process.env;

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN manquant");
  process.exit(1);
}

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

// CORS (autorise GitHub Pages)
app.use(
  cors({
    origin: SITE_ORIGIN ? SITE_ORIGIN : true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.options("*", cors());

app.use(rateLimit({ windowMs: 60_000, max: 30 }));

// ---------- Utils ----------
function jsonError(res, status, code, message, extra = {}) {
  return res.status(status).json({ ok: false, code, error: message, ...extra });
}
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

// ---------- Health ----------
app.get("/", (req, res) => res.send("OK"));

app.get("/status", (req, res) => {
  res.json({
    online: true,
    botReady: client.isReady(),
    originAllowed: SITE_ORIGIN || "ANY",
  });
});

// ---------- Ticket endpoint ----------
app.post("/api/ticket", async (req, res) => {
  try {
    const { pseudo, contact, subject, details } = req.body || {};

    if (!pseudo || !subject || !details) {
      return jsonError(res, 400, "MISSING_FIELDS", "Champs manquants");
    }

    if (!client.isReady()) {
      return jsonError(res, 503, "BOT_NOT_READY", "Bot Discord pas encore prêt");
    }

    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) {
      return jsonError(res, 500, "BAD_GUILD_ID", "GUILD_ID invalide ou bot pas dans le serveur");
    }

    // Vérifie que la catégorie existe
    const category = await guild.channels.fetch(TICKETS_CATEGORY_ID).catch(() => null);
    if (!category) {
      return jsonError(res, 500, "BAD_CATEGORY_ID", "Catégorie introuvable (TICKETS_CATEGORY_ID)");
    }
    if (category.type !== ChannelType.GuildCategory) {
      return jsonError(res, 500, "NOT_A_CATEGORY", "TICKETS_CATEGORY_ID n'est pas une catégorie");
    }

    // Vérifie perms du bot (sinon Discord renvoie 500/Missing Permissions)
    const me = await guild.members.fetch(client.user.id);
    const needed = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.ManageChannels,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ReadMessageHistory,
    ];
    const missing = needed.filter((p) => !me.permissions.has(p));
    if (missing.length) {
      return jsonError(
        res,
        500,
        "MISSING_BOT_PERMS",
        "Le bot n'a pas les perms nécessaires (View/ManageChannels/Send/ReadHistory). Mets le rôle du bot au-dessus et coche les perms.",
        { missingPerms: missing.map(String) }
      );
    }

    const ticketId = makeTicketId();
    const channelName = safeChannelName(pseudo, ticketId);

    const overwrites = [
      // tout le monde n'a pas accès
      {
        id: guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      // staff role 1
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
      // staff role 2 (optionnel)
      ...(STAFF_ROLE_ID_2
        ? [
            {
              id: STAFF_ROLE_ID_2,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks,
              ],
            },
          ]
        : []),
      // bot
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

    const mentions = [`<@&${STAFF_ROLE_ID}>`];
    if (STAFF_ROLE_ID_2) mentions.push(`<@&${STAFF_ROLE_ID_2}>`);

    await channel.send({
      content: `${mentions.join(" ")} Ticket créé ✅`,
      embeds: [embed],
    });

    return res.json({
      ok: true,
      id: ticketId,
      channelUrl: `https://discord.com/channels/${GUILD_ID}/${channel.id}`,
    });
  } catch (e) {
    console.error("❌ /api/ticket error:", e?.message);
    console.error(e?.stack);
    return jsonError(res, 500, "SERVER_ERROR", e?.message || "Erreur serveur");
  }
});

// ---------- Listen ----------
app.listen(Number(PORT), () => {
  console.log(`🌐 API en ligne sur le port ${PORT}`);
});
