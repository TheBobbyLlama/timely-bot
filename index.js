const firebaseAdmin = require("firebase-admin");
const { Client, Intents, MessageActionRow, MessageSelectMenu } = require("discord.js");
const timezones = require("./timezones.json");
const DST = require("./DST.json");
require("dotenv").config();

const timezonePrefix = "timekeeperTZ";
const dstPrefix = "timekeeperDST";

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

		rows.push(new MessageActionRow()
		.addComponents(
			new MessageSelectMenu()
				.setCustomId("select")
				.setPlaceholder("Select Time Zone")
				.addOptions(timezones.map(tz => { return { label: tz.label, value: timezonePrefix + ":" + tz.value }}))
		));

		rows.push(new MessageActionRow()
		.addComponents(
			new MessageSelectMenu()
				.setCustomId("select2")
				.setPlaceholder("Select Daylight Savings Type")
				.addOptions(DST.map(ds => { return { label: ds.label, value: dstPrefix + ":" + ds.label }}))
		));

		await interaction.reply({ content: "Select your time zone:", components: rows, ephemeral: true });
	} else {
		interaction.reply({ content: "Invalid command.", ephemeral: true });
	}
});

// Selections.
client.on("interactionCreate", async interaction => {
	if (!interaction.isSelectMenu()) return;

	try {
		if ((interaction.message.interaction.commandName === "timekeeper") && (interaction.values[0])) {
			let interactionData = interaction.values[0].split(":");

			switch (interactionData[0]) {
				case timezonePrefix:
					let tzValue = interactionData[1];
					await database.ref("users/" + interaction.user.id + "/timezone").set(tzValue);
					await interaction.reply({ content: "Timezone set to `" + timezones.find(tz => tz.value === tzValue).label + "`", ephemeral: true })
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

		const finds = message.content.match(/\b(([1-9]|10|11|12)(:[0-5][0-9])?\s?[aApP][mM])|\b(([1-9]|10|11|12):[0-5][0-9])/g);

		// Keep going if we found a time - but not too many!
		if ((finds?.length) && (finds.length <= 4)) {
			const tzResult = await getUserInfo(message.author.id);
			const zone = tzResult.timezone;

			// Keep going if the message's author has a time zone registered.
			if (zone) {
				const offset = timezones.find(tz => tz.value === zone).offset;
				const dstSetting = DST.find(ds => ds.label === tzResult.dst) || {};
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

				// Shift the times to UTC.
				const adjustedTimes = finds.map(time => {
					let curTime = time.toLowerCase();
					let ampm;

					if (curTime.endsWith("pm")) {
						ampm = "pm";
					} else if (curTime.endsWith("am")) {
						ampm = "am";
					} else {
						// Figure out whichever am or pm is next!!!
						let tmpDate = new Date();
						tmpDate.setUTCMinutes(0, 0, 0);

						if (tmpDate.getUTCHours() + offset >= 12) {
							ampm = "pm";
						} else {
							ampm = "am";
						}
					}

					curTime = curTime.replace(/^(.+)\s?[ap]m$/, "$1");

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
					return result;
				});

				// Spit out the results.
				var output = "";

				for (var i = 0; i < finds.length; i++) {
					if (i > 0) output += "\n";

					output += "**" + finds[i] + "** - " + "<t:" + Math.floor(adjustedTimes[i].getTime() / 1000) + ":t>";
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