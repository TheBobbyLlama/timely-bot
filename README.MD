# Timely

Timely is a Discord bot for converting times for users across the world using Discord's timestamp feature.  All you have to do to start using the bot is mark the time as code using backticks (`` ` ``), and it will reply with the time converted into a timestamp that anyone will see in the proper local time and time zones.

![Timely Demo](https://thebobbyllama.github.io/timely-bot/assets/images/bot-demo.png)

The bot may be used without any other configuration if you supply local time information when writing a time - *e.g.* `3:30 PM EST`, `8:30 PDT`, `13:00 UTC`, `1AM (London)`, `12:30 Vancouver`, and so on.  You can tag as many time entries as you like in a post and Timely will convert them all.  Please see the [documentation website](https://thebobbyllama.github.io/timely-bot/) for more info on which tags you can use for local time.

## Automatic Time Conversion

If you would like to use the bot for local times without having to specify your own time zone, you may use the `/timely` command to select your own time zone and daylight savings settings.

![Timely Configuration](https://thebobbyllama.github.io/timely-bot/assets/images/config-blank.png)

Once you have set yourself up, you may omit the time zone from any times you tag and Timely will convert them from your local time - *e.g.* `3 PM`, `8:30`

## Add the Bot to Your Server!

https://discord.com/api/oauth2/authorize?client_id=940552993609240616&permissions=2048&scope=bot%20applications.commands