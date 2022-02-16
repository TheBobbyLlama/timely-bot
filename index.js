const firebaseAdmin = require("firebase-admin");
const { Client, Intents, MessageActionRow, MessageSelectMenu, MessageEmbed } = require("discord.js");
const timezones = require("./timezones.json");
const DST = require("./DST.json");
const tzOverrides = require("./timezoneOverrides.json");
require("dotenv").config();

const timezonePrefix = "timekeeperTZ";
const dstPrefix = "timekeeperDST";

const setupMessage = "Please configure your time zone and daylight savings settings with the dropdowns below.  Your settings will be used across all servers that use Timekeeper, so you will only ever have to do this once!";

let database = null;

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

client.once('ready', () => {
	firebaseAdmin.initializeApp({
		credential: firebaseAdmin.credential.cert({
			type: "service_account",
			project_id: "timekeeper-bot",
			private_key_id: process.env.SA_PRIVATE_KEY_ID,
			private_key: process.env.SA_PRIVATE_KEY.replace(/\\n/gm, "\n"),
			client_email: process.env.SA_CLIENT_EMAIL,
			client_id: process.env.SA_CLIENT_ID,
			auth_uri: "https://accounts.google.com/o/oauth2/auth",
			token_uri: "https://oauth2.googleapis.com/token",
			auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
			client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-pln7w%40timekeeper-bot.iam.gserviceaccount.com"
		}),
		databaseURL:"https://timekeeper-bot-default-rtdb.firebaseio.com" 
	});

	database = firebaseAdmin.database();

	console.log("Running!");
});

// Slash Commands.
client.on("interactionCreate", async interaction => {
	if (!interaction.isCommand()) return;

	if (interaction.commandName === "timekeeper") {
		let rows = [];

		const tzResult = (await getUserInfo(interaction.user.id) || {});

		rows.push(new MessageActionRow()
		.addComponents(
			new MessageSelectMenu()
				.setCustomId("select")
				.setPlaceholder("Select Time Zone")
				.addOptions(timezones.map(tz => { return { label: tz.label, value: timezonePrefix + ":" + tz.value, default: tzResult.timezone === tz.value }}))
		));

		rows.push(new MessageActionRow()
		.addComponents(
			new MessageSelectMenu()
				.setCustomId("select2")
				.setPlaceholder("Select Daylight Savings Type")
				.addOptions(DST.map(ds => { return { label: ds.label, value: dstPrefix + ":" + ds.label, default: tzResult.dst === ds.label }}))
		));

		const docEmbed = new MessageEmbed()
							.setTitle("Timekeeper Documentation")
							.setDescription("More information on how the bot works can be found here.")
							.setThumbnail("https://thebobbyllama.github.io/timekeeper-bot/assets/images/Timekeeper.png")
							.setAuthor({ name: "The Bobby Llama", url: "https://discordapp.com/users/288977733390696448/" })
							.setURL("https://thebobbyllama.github.io/timekeeper-bot/");

		await interaction.reply({ content: setupMessage, components: rows, embeds: [ docEmbed ], ephemeral: true });
	} else {
		interaction.reply({ content: "Invalid command.", ephemeral: true });
	}
});

// Selections.
client.on("interactionCreate", async interaction => {
	if (!interaction.isSelectMenu()) return;

	try {
		if (((interaction.message.interaction.commandName === "timekeeper") || (interaction.message.interaction.name === "timekeeper")) && (interaction.values[0])) {
			let interactionData = interaction.values[0].split(":");

			switch (interactionData[0]) {
				case timezonePrefix:
					let tzValue = interactionData[1];
					await database.ref("users/" + interaction.user.id + "/timezone").set(tzValue);
					await interaction.reply({ content: "Timezone set to `" + timezones.find(tz => tz.value === tzValue).label + "`\n\nTimekeeper will now reply to any of your posts containing times and convert them into Discord timestamps.", ephemeral: true })
					break;
				case dstPrefix:
					let dsValue = interactionData[1];
					await database.ref("users/" + interaction.user.id + "/dst").set(dsValue);
					await interaction.reply({ content: "Daylight savings will be calculated to `" + dsValue + "` standards.", ephemeral: true });
					break;
				default:
					throw new Error("Invalid command.");
			}
		}
	} catch (err) {
		await interaction.reply({ content: "An error occurred: `" + (err.message || err) + "`", ephemeral: true });
	}
});

// Message listener.
client.on("messageCreate", async message => {
	try {
		if (message.author.bot) return;

		const finds = message.content.match(/`((([1-9]|1[0-9]|2[0-3])(:[0-5][0-9])?\s?[ap][m])|(([0-9]|1[0-9]|2[0-3]):[0-5][0-9]))( (e[ds]t|c[ds]t|m[ds]t|p[ds]t|utc))?`/gi);

		// Keep going if we found a time - but not too many!
		if (finds?.length) {
			const results = [];
			const tzResult = await getUserInfo(message.author.id);

			// Shift the times to UTC.
			finds.forEach(time => {
				let curTime = time.toLowerCase().replace(/`/g, "");
				let ampm;
				let curTZ = tzOverrides.find(tz => curTime.endsWith(tz.key)) || tzResult;

				if (curTZ?.timezone) {
					const offset = timezones.find(tz => tz.value === curTZ.timezone).offset;
					const dstSetting = DST.find(ds => ds.label === curTZ.dst) || {};
					let dstOffset = 0;
	
					// Figure out if the author is in daylight savings time.
					if (dstSetting.starts) {
						// Convert current time to UTC
						let checkTime = new Date();
						checkTime.setUTCHours(checkTime.getUTCHours() - offset);
	
						let startTime = calculateDate(dstSetting.starts);
						let endTime = calculateDate(dstSetting.ends);
	
						if (startTime < endTime) {
							if ((startTime < checkTime) && (checkTime < endTime)) {
								dstOffset = 1;
							}
						} else if (startTime > endTime) {
							if ((checkTime < startTime) || (endTime < checkTime)) {
								dstOffset = 1;
							}
						}
					}

					if (curTime.match(/pm\b/i)) {
						ampm = "pm";
					} else if (curTime.match(/am\b/i)) {
						ampm = "am";
					} else if (!curTime.endsWith("utc")) {
						// Figure out whichever am or pm is next!!!
						let tmpDate = new Date();
						tmpDate.setUTCMinutes(0, 0, 0);

						let inputHours = curTime.match(/^\d+/);
						let curHours = tmpDate.getUTCHours() + offset;

						if ((curHours % 12) > inputHours) {
							ampm = (curHours >= 12) ? "am" : "pm";
						} else {
							ampm = (curHours >= 12) ? "pm" : "am";
						}
					}

					curTime = curTime.replace(/^([0-9:]+)[\sa-z]*$/, "$1");

					const splits = curTime.split(":");

					if (splits.length) {
						if (ampm === "pm") {
							if (Number(splits[0]) !== 12) {
								splits[0] = Number(splits[0]) + 12;
							}
						} else if (Number(splits[0]) === 12) {
							splits[0] = 24;
						}
					}

					var result = new Date();
					result.setUTCHours(Number(splits[0]) - offset - dstOffset, splits[1] || 0, 0, 0);
					results.push([ time, result]);
				}
			});

			// Spit out the results, if we have any.
			if (results.length) {
				var output = "";

				for (var i = 0; i < results.length; i++) {
					if (i > 0) output += "\n";

					output += "**" + results[i][0] + "** - " + "<t:" + Math.floor(results[i][1].getTime() / 1000) + ":t>";
				}

				message.reply(output);
			}
		}
	} catch (err) {
		await message.reply("An error occurred: `" + (err.message || err) + "`");
	}
});

// Pull user entry from the database.
const getUserInfo = async (userId) => {
	return await database.ref("users/" + userId).once("value").then((result) => {
		return result.val() || {};
	});
}

// Use DST data to figure out a date (last Sunday in March, first Sunday in October, and so on)
const calculateDate = (dateInfo) => {
	let result = new Date();
	result.setUTCHours(0, 0, 0, 0);
	let maxDays = new Date(result.getUTCFullYear(), dateInfo.month + 1, 0).getDate();
	let curDay = 0;
	let dayHits = 0;

	// Positive dayCount -> count from the beginning of the month.
	if (dateInfo.dayCount > 0) {
		result.setUTCMonth(dateInfo.month + 1);

		for (curDay = 0; curDay < maxDays; curDay++) {
			result.setUTCDate(curDay);

			if (result.getUTCDay() === dateInfo.weekday) {
				if (++dayHits >= dateInfo.dayCount) {
					break;
				}
			}
		}
	// Negative dayCount -> count from the end of the month.
	} else if (dateInfo.dayCount < 0) {
		result.setUTCMonth(dateInfo.month);

		for (curDay = maxDays - 1; curDay >= 0; curDay--) {
			result.setUTCDate(curDay);

			if (result.getUTCDay() === dateInfo.weekday) {
				if (--dayHits <= dateInfo.dayCount) {
					break;
				}
			}
		}
	}

	// Set the time as if we are UTC+0, because the time we're checking against has already been normalized to UTC+0.
	result.setUTCHours(dateInfo.time, 0, 0, 0);

	return result;
}

// Log the bot into Discord.
client.login(process.env.BOT_TOKEN);