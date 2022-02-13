const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

require("dotenv").config();

const commands = [
	new SlashCommandBuilder().setName("timekeeper").setDescription("Configure Timekeeper bot for your time zone and your country's daylight savings time.")
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