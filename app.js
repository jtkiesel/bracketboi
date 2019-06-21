const { Client, RichEmbed } = require('discord.js');
const { MongoClient } = require('mongodb');
const { inspect } = require('util');

const client = new Client();
const token = process.env.BRACKETBOI_TOKEN;
const dbUri = process.env.BRACKETBOI_DB;
const mongoOptions = {
	retryWrites: true,
	reconnectTries: Number.MAX_VALUE,
	useNewUrlParser: true
};
const prefix = '!';
const guildId = '443426769056301057';

const emojis = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫'];
const noneEmoji = '❌';
const acceptEmoji = '✅';

let db;

const createFightEmbed = (fight, choice = '') => {
	let description = '';
	for (let i = 0; i < fight.bots.length; i++) {
		const bot = fight.bots[i];
		description += `${emojis[i]} ${bot}${bot === choice ? ' ⬅️' : ''}\n`;
	}
	description += `${noneEmoji} Abstain (automatic 0)${choice === '' ? ' ⬅️' : ''}`;
	const embed = new RichEmbed()
		.setTitle(`Who will win ${fight.name}?`)
		.setDescription(description);
	return embed;
};

const createPrediction = (user, fight, choice = '') => {
	return {
		_id: {
			user,
			fight
		},
		choice
	};
};

const getPredictions = (user) => {
	return db.collection('predictions').find({'_id.user': user.id}).sort({'_id.fight': 1}).toArray();
};

const handleHelp = user => {
	user.send(`\`${prefix}help\`: Information about all commands.\n\`${prefix}predict\`: Predict the outcome of future fights, and check your predictions for those fights.\n\`${prefix}leaderboard\`: Predictors with the highest number of points.`);
};

const makePredictions = async user => {
	const message1 = await user.send(`You are about to make your predictions for the winners of future fights!\n\nEach fight will be presented to you, one at a time, and you must select the reaction corresponding to the bot you wish to choose for each fight. You also have the option of abstaining from predicting (if, for example, you already know the outcome of a particular fight), but **this will cause your score for that fight to be 0**.\n\nYou will have one minute to make your selection for each fight, and as soon as you make each of your selections, your choices are saved. **But don't worry!** You can change your predictions at any time (up until each fight's expiration time, some predetermined amount of time before the fight airs on TV) by executing the \`${prefix}predict\` command again.\n\nAn arrow emoji will point to your selection if/when you have already made a prediction.\n\nSelect the reaction below when you are ready to begin.`);
	message1.react(acceptEmoji);
	const collected1 = await message1.awaitReactions((reaction, u) => {
		return u.id === user.id && reaction.emoji.name === acceptEmoji;
	}, {time: 100000, max: 1});
	if (collected1.size === 0) {
		message1.edit(`Sorry, your request timed out. Please send \`${prefix}predict\` again to start over.`);
		return;
	}
	const fights = (await db.collection('fights').find().toArray()).filter(fight => Date.parse(fight.deadline) > Date.now());
	if (fights.length === 0) {
		user.send('There are no fights available at the moment.');
		return;
	}
	const predictions = await getPredictions(user) || [];
	let bracketIndex = -1;
	for (let i = 0; i < fights.length; i++) {
		const fight = fights[i];
		if (fight.name.includes('Bracket Definition')) {
			bracketIndex = i;
			const name = fight.name.slice(0, fight.name.indexOf('Bracket Definition'));
			const bots = fight.bots.slice();
			for (let j = 0; j < fight.bots.length / 2; j++) {
				const fightNum = fight.bots.length === 2 ? '' : ` ${j + 1}`;
				fights.push({_id: fight._id + j + 1, name: `${name}${fightNum}`, bots: [bots.shift(), bots.pop()], deadline: fight.deadline});
			}
			continue;
		}
		const choices = emojis.slice(0, fight.bots.length);
		const predictionIndex = predictions.findIndex(prediction => prediction._id.fight === fight._id);
		try {
			const message = await user.send(createFightEmbed(fight, predictionIndex >= 0 ? predictions[predictionIndex].choice : null));
			const collector = message.awaitReactions((reaction, u) => {
				return u.id === user.id && (reaction.emoji.name === noneEmoji || choices.includes(reaction.emoji.name));
			}, {time: 60000, max: 1});
			for (let choice of choices) {
				await message.react(choice);
			}
			await message.react(noneEmoji);
			const collected = await collector;
			for (let choice = 0; choice < choices.length; choice++) {
				const collectedReaction = collected.get(choices[choice]);
				if (collectedReaction && collectedReaction.users.has(user.id)) {
					const bot = fight.bots[choice];
					const prediction = createPrediction(user.id, fight._id, bot);
					if (predictionIndex < 0) {
						predictions.push(prediction);
					} else {
						predictions[predictionIndex] = prediction;
					}
					await db.collection('predictions').findOneAndUpdate({_id: prediction._id}, {$set: prediction}, {upsert: true});
					message.edit(createFightEmbed(fight, bot));
				}
			}
			const collectedReaction = collected.get(noneEmoji);
			if (collectedReaction && collectedReaction.users.has(user.id)) {
				const prediction = createPrediction(user.id, fight._id);
				await db.collection('predictions').findOneAndUpdate({_id: prediction._id}, {$set: prediction}, {upsert: true});
				if (predictionIndex < 0) {
					predictions.push(prediction);
				} else {
					predictions[predictionIndex] = prediction;
				}
				message.edit(createFightEmbed(fight));
			}
			if (collected.size === 0) {
				message.edit(`Sorry, your request timed out. Your choices up until this point have been saved.\nPlease send \`${prefix}predict\` again to start over.`, {embed: null});
				return;
			}
		} catch (err) {
			console.error(err);
		}
		if (i === fights.length - 1 && bracketIndex >= 0) {
			const bracket = fights[bracketIndex];
			const numBots = bracket.bots.length / 2;
			if (numBots > 1) {
				const bots = [];
				for (let j = 0; j < numBots; j++) {
					bots.unshift(predictions.find(prediction => prediction._id.fight === bracket._id + j + 1).choice);
				}
				let round;
				if (numBots >= 16) {
					round = `Round of ${numBots}`;
				} else if (numBots === 8) {
					round = 'Quarterfinals';
				} else if (numBots === 4) {
					round = 'Semifinals';
				} else if (numBots === 2) {
					round = 'Final';
				}
				const name = bracket.name.replace(/[^ ]+ Bracket Definition/, `${round} Bracket Definition`);
				fights.push({_id: bracket._id + numBots + 1, name: name, bots: bots, deadline: bracket.deadline});
			}
		}
	}
	user.send(`You have finished predicting the outcome of all currently available fights.\n\nYou may check on your choices or make changes to them using the \`${prefix}predict\` command.`);
};

const handleCommand = message => {
	const slice = message.content.indexOf(' ');
	const cmd = message.content.slice(prefix.length, (slice < 0) ? message.content.length : slice);
	const args = (slice < 0) ? '' : message.content.slice(slice);

	if (cmd === 'help') {
		handleHelp(message.author);
	} else if (cmd === 'predict') {
		const member = client.guilds.get(guildId).member(message.author);
		if (member && member.roles.find(role => role.name === 'Registered')) {
			makePredictions(message.author);
		} else {
			message.author.send('You must be a Registered BattleBots Prediction League member to execute the `predict` command.');
		}
	} else if (cmd === 'leaderboard') {
		handleLeaderboard(message.author);
	}
};

const handleTeams = async user => {
	const teams = await db.collection('predictions').aggregate()
		.group({_id: '$_id.user', fights: {$push: '$_id.fight'}, size: {$sum: 1}})
		.sort({size: -1})
		.toArray();
	let description = '';
	let page = 0;
	teams.forEach(team => {
		let s = `<@${team._id}> [${team.fights}]\n`;
		if (description.length + s.length <= 2048) {
			description += s;
		} else {
			const embed = new RichEmbed()
				.setTitle(`Teams ${++page}:`)
				.setDescription(description);

			user.send({embed: embed});
			description = s;
		}
	});
	const embed = new RichEmbed()
		.setTitle(`Teams ${page == 0 ? '' : page + 1}:`)
		.setDescription(description);

	user.send({embed});
};

const handleLeaderboard = async user => {
	const predictions = await db.collection('predictions').find().toArray();
	const fights = await db.collection('fights').find({winner: {$exists: true}}).toArray();
	const leaderboard = client.guilds.get(guildId).roles.find(role => role.name === 'Registered').members.keyArray().map(user => {
		return {user: user, score: 0};
	});

	predictions.forEach(prediction => {
		const fight = fights.find(fight => fight._id === prediction._id.fight);
		if (fight && fight.winner === prediction.choice) {
			const score = fight.hasOwnProperty('points') ? fight.points : (fight.name.includes('Rumble') ? 2 : 1);
			const team = leaderboard.find(team => team.user === prediction._id.user);
			if (team) {
				team.score += score;
			} else {
				leaderboard.push({user: prediction._id.user, score: score});
			}
		}
	});
	leaderboard.sort((a, b) => b.score - a.score);
	let description = '';
	let page = 0;
	let lastScore = -1;
	for (let i = 0; i < leaderboard.length; i++) {
		if (leaderboard[i].score !== lastScore) {
			lastRank = i;
			lastScore = leaderboard[i].score;
		}
		let s = `**\`#${String(lastRank + 1).padEnd(3)}\​\`** <@${leaderboard[i].user}> \`${leaderboard[i].score} point${leaderboard[i].score === 1 ? '' : 's'}\`\n`;
		if (description.length + s.length <= 2048) {
			description += s;
		} else {
			const embed = new RichEmbed()
				.setTitle(`Leaderboard ${++page}:`)
				.setDescription(description);

			user.send({embed: embed});
			description = s;
		}
	}
	const embed = new RichEmbed()
		.setTitle(`Leaderboard ${page == 0 ? '' : page + 1}:`)
		.setDescription(description);

	user.send({embed});
};

const clean = text => {
	if (typeof text === 'string') {
		return text.replace(/`/g, '`' + String.fromCharCode(8203)).replace(/@/g, '@' + String.fromCharCode(8203)).slice(0, 1990);
	}
	return text;
};

const handleAdminCommand = async message => {
	const slice = message.content.indexOf(' ');
	const cmd = message.content.slice(prefix.length, (slice < 0) ? message.content.length : slice);
	const args = (slice < 0) ? '' : message.content.slice(slice);

	if (cmd === 'help') {
		handleHelp(message.author);
	} else if (cmd === 'predict') {
		makePredictions(message.author);
	} else if (cmd === 'teams') {
		handleTeams(message.author);
	} else if (cmd === 'leaderboard') {
		handleLeaderboard(message.author);
	} else if (cmd === 'eval') {
		if (message.author.id === '197781934116569088') {
			try {
				let evaled = /\s*await\s+/.test(args) ? (await eval(`const f = async () => {\n${args}\n};\nf();`)) : eval(args);
				if (typeof evaled !== 'string') {
					evaled = inspect(evaled);
				}
				message.channel.send(clean(evaled), {code: 'xl'}).catch(console.error);
			} catch (error) {
				message.channel.send(`\`ERROR\` \`\`\`xl\n${clean(error)}\`\`\``).catch(console.error);
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

client.on('message', async message => {
	if (message.content.startsWith(prefix)) {
		const member = client.guilds.get(guildId).member(message.author);
		if (member && member.roles.find(role => role.name === 'Administrator')) {
			handleAdminCommand(message);
		} else {
			handleCommand(message);
		}
	}
});

MongoClient.connect(dbUri, mongoOptions).then(mongoClient => {
	db = mongoClient.db('battlebots');

	client.login(token).catch(console.error);
}).catch(console.error);
