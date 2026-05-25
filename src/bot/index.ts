import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { db } from "@workspace/db";
import { authorizedUsersTable, keysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { randomBytes } from "crypto";

function generateKey(): string {
  const part = randomBytes(3).toString("hex").toUpperCase();
  return `M3H-${part}`;
}

const commands = [
  new SlashCommandBuilder()
    .setName("gerar")
    .setDescription("Gera uma nova key de acesso"),

  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Desativa uma key existente")
    .addStringOption((opt) =>
      opt.setName("key").setDescription("A key que deseja desativar").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("add")
    .setDescription("Adiciona um usuário autorizado a gerar keys")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt.setName("id").setDescription("ID do usuário Discord").setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

async function handleGerar(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;

  const authorized = await db
    .select()
    .from(authorizedUsersTable)
    .where(eq(authorizedUsersTable.discordUserId, userId));

  if (authorized.length === 0) {
    await interaction.reply({ content: "❌ Você não tem permissão para gerar keys.", ephemeral: true });
    return;
  }

  const newKey = generateKey();
  await db.insert(keysTable).values({ key: newKey, discordUserId: userId, isActive: true });

  await interaction.reply({ content: `✅ Sua key foi gerada com sucesso!\n\`${newKey}\``, ephemeral: true });
}

async function handleReset(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const keyValue = interaction.options.getString("key", true);

  const found = await db.select().from(keysTable).where(eq(keysTable.key, keyValue));

  if (found.length === 0) {
    await interaction.reply({ content: "❌ Key não encontrada.", ephemeral: true });
    return;
  }

  const keyRow = found[0]!;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;

  if (keyRow.discordUserId !== userId && !isAdmin) {
    await interaction.reply({ content: "❌ Você só pode resetar suas próprias keys.", ephemeral: true });
    return;
  }

  if (!keyRow.isActive) {
    await interaction.reply({ content: "⚠️ Essa key já está desativada.", ephemeral: true });
    return;
  }

  await db.update(keysTable).set({ isActive: false }).where(eq(keysTable.key, keyValue));

  await interaction.reply({ content: `🔒 Key desativada com sucesso!\n\`\`\`\n${keyValue}\n\`\`\``, ephemeral: true });
}

async function handleAdd(interaction: ChatInputCommandInteraction) {
  const targetUserId = interaction.options.getString("id", true);

  if (!/^\d{17,20}$/.test(targetUserId)) {
    await interaction.reply({ content: "❌ ID inválido. Informe um ID numérico do Discord.", ephemeral: true });
    return;
  }

  const existing = await db
    .select()
    .from(authorizedUsersTable)
    .where(eq(authorizedUsersTable.discordUserId, targetUserId));

  if (existing.length > 0) {
    await interaction.reply({ content: `⚠️ O usuário <@${targetUserId}> já está autorizado.`, ephemeral: true });
    return;
  }

  await db.insert(authorizedUsersTable).values({ discordUserId: targetUserId });

  await interaction.reply({ content: `✅ Usuário <@${targetUserId}> adicionado! Agora ele pode usar \`/gerar\`.`, ephemeral: true });
}

export async function startBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN não definido — bot não será iniciado.");
    return;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("ready", async (c) => {
    logger.info({ tag: c.user.tag }, "Bot Discord conectado");
    const rest = new REST().setToken(token);
    try {
      await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
      logger.info("Slash commands registrados globalmente");
    } catch (err) {
      logger.error({ err }, "Erro ao registrar slash commands");
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      if (interaction.commandName === "gerar") await handleGerar(interaction);
      else if (interaction.commandName === "reset") await handleReset(interaction);
      else if (interaction.commandName === "add") await handleAdd(interaction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, "Erro no comando");
      if (!interaction.replied) {
        await interaction.reply({ content: "❌ Ocorreu um erro interno. Tente novamente.", ephemeral: true });
      }
    }
  });

  await client.login(token);
}
