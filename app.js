const Discord = require('discord.js');

const client = new Discord.Client();
const token = process.env.BRACKETBOI_TOKEN;
const prefix = '!';
const guildId = '443426769056301057';

const emojis = ['🇦', '🇧', '🇨', '🇩'];

const battles = {
	'Test Battle 1': ['Tombstone', 'Minotaur'],
	'Test Battle 2': ['End Game', 'HUGE']
};

const createBattleEmbed = (battle, bots) => {
	let description = '';
	for (let i = 0; i < bots.length; i++) {
		description += `${emojis[i]} ${bots[i]}\n`;
	}
	const embed = new Discord.MessageEmbed()
			.setTitle(`Who will win ${battle}?`)
			.setDescription(description);

	return embed;
};

const handlePredictions = user => {
	for (let battle in battles) {
		user.send(createBattleEmbed(battle, battles[battle]));
	}
};

const handleCommand = message => {
	const slice = message.content.indexOf(' ');
	const cmd = message.content.slice(prefix.length, (slice < 0) ? message.content.length : slice);
	const args = (slice < 0) ? '' : message.content.slice(slice);

	if (cmd === 'go') {
		handlePredictions(message.author);
	} else if (cmd === 'eval') {
		if (message.author.id === '197781934116569088') {
			try {
				let evaled = eval(args);
				if (typeof evaled !== 'string') {
					evaled = util.inspect(evaled);
				}
				message.channel.send(clean(evaled), {code: 'xl'});
			} catch (error) {
				message.channel.send(`\`ERROR\` \`\`\`xl\n${clean(error)}\`\`\``);
			}
		} else {
			message.reply('you don\'t have permission to run that command.');
		}
	}
};

client.on('ready', () => {
	console.log('I am ready!');
});

client.on('error', console.error);

client.on('message', message => {
if (message.author.id === '197781934116569088') {
	if (message.content.startsWith(prefix)) {
		if (!message.guild || message.guild.id !== guildId) {
			try {
				const profile = await message.author.fetchProfile();
				if (!profile.mutualGuilds.has(guildId)) {
					message.reply('You must first become a member of the BattleBots Prediction League server.');
					return;
				}
			} catch (err) {
				console.error(err);
			}
		}
		handleCommand(message);
	}
}
});

client.login(token);
