const firebaseAdmin = require("firebase-admin");
const { Client, Intents, MessageActionRow, MessageSelectMenu } = require("discord.js");
const timezones = require("./timezones.json");
const DST = require("./DST.json");
require("dotenv").config();

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

client.on("interactionCreate", async interaction => {
	if (!interaction.isCommand()) return;

	let row;
	const { commandName } = interaction;

	switch (commandName) {
		case "timekeeper":
			row = new MessageActionRow()
				.addComponents(
					new MessageSelectMenu()
						.setCustomId("select")
						.setPlaceholder("Select Time Zone")
						.addOptions(timezones.map(tz => { return { label: tz.label, value: tz.value }}))
				);

			await interaction.reply({ content: "Select your time zone:", components: [row] });
			break;
		case "timekeeper_dst":
			row = new MessageActionRow()
				.addComponents(
					new MessageSelectMenu()
						.setCustomId("select")
						.setPlaceholder("Select Daylight Savings Type")
						.addOptions(DST.map(ds => { return { label: ds.label, value: ds.label }}))
				);

			await interaction.reply({ content: "Select daylight savings:", components: [row] });
			break;
		default:
			interaction.reply("Invalid command.");
	}

});

client.on("interactionCreate", async interaction => {
	if (!interaction.isSelectMenu()) return;

	try {
		if (interaction.values[0]) {
			switch (interaction.message.interaction.commandName) {
				case "timekeeper":
					let tzValue = interaction.values[0];
					await database.ref("users/" + interaction.user.id + "/timezone").set(tzValue);
					await interaction.update({ content: "Timezone set to `" + timezones.find(tz => tz.value === tzValue).label + "`", components: [] });
					break;
				case "timekeeper_dst":
					let dsValue = interaction.values[0];
					await database.ref("users/" + interaction.user.id + "/dst").set(dsValue);
					await interaction.update({ content: "Daylight savings will be calculated to `" + dsValue + "` standards.", components: [] });
					break;
				default:
					throw new Error("Invalid command.");
			}
		}
	} catch (err) {
		await interaction.reply("An error occurred: `" + (err.message || err) + "`");
	}
});

client.on("messageCreate", async message => {
	try {
		const finds = message.content.match(/\b(([1-9]|10|11|12)(:[0-5][0-9])?\s?[aApP][mM])|\b(([1-9]|10|11|12):[0-5][0-9])/g);

		if (finds?.length) {
			const tzResult = await getUserTimezone(message.author.id);
			const zone = tzResult.timezone;

			if (zone) {
				const offset = timezones.find(tz => tz.value === zone).offset;
				const dstSetting = DST.find(ds => ds.label === tzResult.dst) || {};
				let dstOffset = 0;

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

				if (finds.length > 1) {
					var output = "__TIMES__";
					for (var i = 0; i < finds.length; i++) {
						output += "\n**" + finds[i] + "** - " + "<t:" + Math.floor(adjustedTimes[i].getTime() / 1000) + ":t>";
					}

					message.reply(output);
				} else {
					message.reply("**" + finds[0] + "** - <t:" + Math.floor(adjustedTimes[0].getTime() / 1000) + ":t>");
				}
			}
		}
	} catch (err) {
		await message.reply("An error occurred: `" + (err.message || err) + "`");
	}
});

const getUserTimezone = async (userId) => {
	return await database.ref("users/" + userId).once("value").then((result) => {
		return result.val() || {};
	});
}

const calculateDate = (dateInfo) => {
	let result = new Date();
	result.setUTCHours(0, 0, 0, 0);
	let maxDays = new Date(result.getUTCFullYear(), dateInfo.month + 1, 0).getDate();
	let curDay = 0;
	let dayHits = 0;

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

	result.setUTCHours(dateInfo.time, 0, 0, 0);

	return result;
}

// Login to Discord with your client's token
client.login(process.env.BOT_TOKEN);