const Discord = require('discord.js');
const mongodb = require('mongodb');
const util = require('util');

const client = new Discord.Client();
const MongoClient = mongodb.MongoClient;
const token = process.env.BRACKETBOI_TOKEN;
const mongodbUri = process.env.BRACKETBOI_DB;
const mongodbOptions = {
	keepAlive: 1,
	connectTimeoutMS: 30000,
	reconnectTries: 30,
	reconnectInterval: 5000
};
const prefix = '!';
const guildId = '443426769056301057';

const emojis = ['🇦', '🇧', '🇨', '🇩'];
const noneEmoji = '❌';
const acceptEmoji = '✅';

const episode1Expiration = 'May 11 2018 12:00 PM EDT';

let db;

const createBattleEmbed = (battle, choice = null) => {
	let description = '';
	for (let i = 0; i < battle.bots.length; i++) {
		description += `${emojis[i]} ${battle.bots[i]}${i === choice ? ' ⬅️' : ''}\n`;
	}
	description += `${noneEmoji} Abstain (automatic 0)${choice === -1 ? ' ⬅️' : ''}`;
	const embed = new Discord.MessageEmbed()
		.setTitle(`Who will win ${battle.name}?`)
		.setDescription(description);
	return embed;
};

const createPrediction = (user, battle, choice) => {
	return {
		_id: {
			user: user,
			battle: battle
		},
		choice: choice
	};
};

const getPredictions = (user) => {
	return db.collection('predictions').find({'_id.user': user.id}).sort({'_id.battle': 1}).toArray();
};

const handleHelp = user => {
	user.send('`!help`: Information about all commands.\n`!predict`: Predict the outcome of future battles.\n`!check`: Your predictions for future battles.\n`!check all`: Your predictions for all battles.\n`!leaderboard`: Predictors with the highest number of points.');
};

const makePredictions = async user => {
	const message1 = await user.send('You are about to make your predictions for the winners of future battles!\n\nEach battle will be presented to you, one at a time, and you must select the reaction corresponding to the bot you wish to choose for each battle. You also have the option of abstaining from predicting (if, for example, you already know the outcome of a particular battle), but **this will cause your score for that battle to be 0**.\n\nYou will have one minute to make your selection for each battle, and as soon as you make each of your selections, your choices are saved. **But don\'t worry!** You can change your predictions at any time (up until each battle\'s expiration time, some predetermined amount of time before the battle airs on TV) by executing the `!predict` command again.\n\nAn arrow emoji will point to your selection if/when you have already made a prediction.\n\nSelect the reaction below when you are ready to begin.');
	message1.react(acceptEmoji);
	const collected1 = await message1.awaitReactions((reaction, u) => {
		return u.id === user.id && reaction.emoji.name === acceptEmoji;
	}, {time: 100000, max: 1});
	const reaction1 = message1.reactions.get(acceptEmoji);
	if (reaction1) {
		reaction1.users.remove(client.id);
	}
	if (collected1.size === 0) {
		message1.edit('Sorry, your request timed out. Please send \`!predict\` again to start over.');
		return;
	}
	const battles = (await db.collection('battles').find().toArray()).filter(battle => Date.parse(battle.deadline) > Date.now());
	if (battles.length === 0) {
		user.send('There are no battles available at the moment. Please use `!check all` to review your past predictions.');
		return;
	}
	const predictions = await getPredictions(user);
	for (let battle of battles) {
		const choices = emojis.slice(0, battle.bots.length);
		let currentChoice = null;
		if (predictions && predictions.length) {
			const currentPrediction = predictions.find(prediction => prediction._id.battle === battle._id);
			if (currentPrediction) {
				currentChoice = currentPrediction.choice;
			}
		}
		try {
			const message = await user.send(createBattleEmbed(battle, currentChoice));
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
					const prediction = createPrediction(user.id, battle._id, choice);
					await db.collection('predictions').findOneAndUpdate({_id: prediction._id}, {$set: prediction}, {upsert: true});
					message.edit(createBattleEmbed(battle, choice));
				}
				const reaction = message.reactions.get(choices[choice]);
				if (reaction) {
					reaction.users.remove(client.id);
				}
			}
			const collectedReaction = collected.get(noneEmoji);
			if (collectedReaction && collectedReaction.users.has(user.id)) {
				const prediction = createPrediction(user.id, battle._id, -1);
				await db.collection('predictions').findOneAndUpdate({_id: prediction._id}, {$set: prediction}, {upsert: true});
				message.edit(createBattleEmbed(battle, -1));
			}
			const reaction = message.reactions.get(noneEmoji);
			if (reaction) {
				reaction.users.remove(client.id);
			}
			if (collected.size === 0) {
				message.edit('Sorry, your request timed out. Your choices up until this point have been saved.\nPlease send \`!predict\` again to start over.', {embed: null});
				return;
			}
		} catch (err) {
			console.error(err);
		}
	}
	user.send('You have finished predicting the outcome of all currently available battles.\n\nYou may check on your choices at any time with the `!check` command, or make changes to them using the `!predict` command.');
};

const checkPredictions = async (user, all) => {
	const battles = await db.collection('battles').find().toArray();
	let predictions = await getPredictions(user);
	if (predictions && !all) {
		predictions = predictions.filter(prediction => {
			const battle = battles.find(battle => battle._id === prediction._id.battle);
			return battle.hasOwnProperty('winner');
		});
	}
	if (!predictions || predictions.length == 0) {
		user.send('No future battle predictions to display. Try running `!check all` to see previous predictions or `!predict` to see if new battles are available.');
		return;
	}
	for (let prediction of predictions) {
		const battle = battles.find(battle => battle._id === prediction._id.battle);
		await user.send(createBattleEmbed(battle, prediction.choice));
	}
};

const handleCommand = message => {
	const slice = message.content.indexOf(' ');
	const cmd = message.content.slice(prefix.length, (slice < 0) ? message.content.length : slice);
	const args = (slice < 0) ? '' : message.content.slice(slice);

	if (cmd === 'help') {
		handleHelp(message.author);
	} else if (cmd === 'predict') {
		makePredictions(message.author);
	} else if (cmd === 'check') {
		checkPredictions(message.author, (args && args.includes('all')));
	} else if (cmd === 'leaderboard') {
		handleLeaderboard(message.author);
	}
};

const handleTeams = async user => {
	const teams = await db.collection('predictions').aggregate()
		.group({_id: '$_id.user', battles: {$push: '$_id.battle'}, size: {$sum: 1}})
		.sort({size: -1})
		.toArray();
	let description = '';
	teams.forEach(team => {
		description += `<@${team._id}> [${team.battles}]\n`;
	});
	const embed = new Discord.MessageEmbed()
		.setTitle('Teams:')
		.setDescription(description);

	user.send({embed: embed});
};

const handleLeaderboard = async user => {
	const predictions = await db.collection('predictions').find().toArray();
	const battles = await db.collection('battles').find({winner: {$exists: true}}).toArray();
	const leaderboard = client.guilds.get(guildId).roles.find('name', 'Registered').members.keyArray().map(user => { return {user: user, score: 0} });

	predictions.forEach(prediction => {
		const battle = battles.find(battle => battle._id === prediction._id.battle);
		if (battle && battle.winner === prediction.choice) {
			leaderboard.find(team => team.user === prediction._id.user).score += battle.name.includes('Rumble') ? 2 : 1;
		}
	});
	leaderboard.sort((a, b) => b.score - a.score);
	let description = '';
	let lastScore = -1;
	for (let i = 0; i < leaderboard.length; i++) {
		if (leaderboard[i].score !== lastScore) {
			lastRank = i;
			lastScore = leaderboard[i].score;
		}
		description += `**\`#${String(lastRank + 1).padEnd(3)}\​\`** <@${leaderboard[i].user}> \`${leaderboard[i].score} point${leaderboard[i].score === 1 ? '' : 's'}\`\n`;
	}
	const embed = new Discord.MessageEmbed()
		.setTitle('Leaderboard:')
		.setDescription(description);

	user.send({embed: embed});
};

const handleAdminCommand = message => {
	const slice = message.content.indexOf(' ');
	const cmd = message.content.slice(prefix.length, (slice < 0) ? message.content.length : slice);
	const args = (slice < 0) ? '' : message.content.slice(slice);

	if (cmd === 'help') {
		handleHelp(message.author);
	} else if (cmd === 'predict') {
		makePredictions(message.author);
	} else if (cmd === 'check') {
		checkPredictions(message.author, (args && args.includes('all')));
	} else if (cmd === 'teams') {
		handleTeams(message.author);
	} else if (cmd === 'leaderboard') {
		handleLeaderboard(message.author);
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

client.on('message', async message => {
	if (message.content.startsWith(prefix)) {
		const member = client.guilds.get(guildId).member(message.author);
		if (member && member.roles.find('name', 'Administrator')) {
			handleAdminCommand(message);
		} else if (member && member.roles.find('name', 'Registered')) {
			handleCommand(message);
		} else {
			message.author.send('You must be a Registered BattleBots Prediction League member to execute commands.');
		}
	}
});

MongoClient.connect(mongodbUri, mongodbOptions).then(mongoClient => {
	db = mongoClient.db(mongodbUri.match(/\/([^/]+)$/)[1]);
	module.exports.db = db;

	client.login(token).catch(console.error);
}).catch(console.error);
