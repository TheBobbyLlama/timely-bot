const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

require("dotenv").config();

const commands = [
	new SlashCommandBuilder().setName("timekeeper").setDescription("Configure your time zone for the Timekeeper bot."),
	new SlashCommandBuilder().setName("timekeeper_dst").setDescription("Choose your daylight savings time setting.")
].map(command => command.toJSON());

const registerCommands = async () => {
	const rest = new REST({ version: '9' }).setToken(process.env.BOT_TOKEN);

	await rest.put(
		Routes.applicationCommands(process.env.BOT_CLIENT_ID),
		{ body: commands },
	);

	console.log("Finished!");
}

registerCommands();