import { Client, Constants, Message, MessageEmbed, User } from 'discord.js';
import { Db, MongoClient } from 'mongodb';
import { inspect } from 'util';

const client = new Client();
const token = process.env.BRACKETBOI_TOKEN;
const dbUri = process.env.BRACKETBOI_DB;
const mongoOptions = {
  retryWrites: true,
  useNewUrlParser: true,
  useUnifiedTopology: true
};
const prefix = '!';
const guildId = '443426769056301057';
const registeredRoleId = '443427905154973698';
const adminRoleId = '443427495098974240';

const emojis = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫'];
const noneEmoji = '❌';
const acceptEmoji = '✅';

let db: Db;

const createFightEmbed = (fight, choice = '') => {
  let description = '';
  for (let i = 0; i < fight.bots.length; i++) {
    const bot = fight.bots[i];
    description += `${emojis[i]} ${bot}${bot === choice ? ' ⬅️' : ''}\n`;
  }
  description += `${noneEmoji} Abstain (automatic 0)${choice === '' ? ' ⬅️' : ''}`;
  const embed = new MessageEmbed()
    .setTitle(`Who will win ${fight.name}?`)
    .setDescription(description);
  return embed;
};

const createPrediction = (user: string, fight: string, choice = '') => {
  return {
    _id: {
      user,
      fight
    },
    choice
  };
};

const getPredictions = (user: User) => {
  return db.collection('predictions').find({'_id.user': user.id}).sort({'_id.fight': 1}).toArray();
};

const handleHelp = (user: User) => {
  user.send(`\`${prefix}help\`: Information about all commands.\n\`${prefix}predict\`: Predict the outcome of future fights, and check your predictions for those fights.\n\`${prefix}leaderboard\`: Predictors with the highest number of points.`);
};

const makePredictions = async (user: User) => {
  const message1 = await user.send(`You are about to make your predictions for the winners of future fights!\n\nEach fight will be presented to you, one at a time, and you must select the reaction corresponding to the bot you wish to choose for each fight. You also have the option of abstaining from predicting (if, for example, you already know the outcome of a particular fight), but **this will cause your score for that fight to be 0**.\n\nYou will have one minute to make your selection for each fight, and as soon as you make each of your selections, your choices are saved. **But don't worry!** You can change your predictions at any time (up until each fight's expiration time, some predetermined amount of time before the fight airs on TV) by executing the \`${prefix}predict\` command again.\n\nAn arrow emoji will point to your selection if/when you have made a prediction.\n\nSelect the reaction below when you are ready to begin.`);
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
        fights.push({_id: fight._id + j + 1, name: `${name}${fightNum}`, bots: [bots.shift(), bots.splice(bots.length - ((bots.length % 2) ? 1 : 2), 1)[0]], deadline: fight.deadline});
      }
      continue;
    }
    if (fight.bots[1] === undefined) {
      const prediction = createPrediction(user.id, fight._id, fight.bots[0]);
      await db.collection('predictions').findOneAndUpdate({_id: prediction._id}, {$set: prediction}, {upsert: true});
    } else {
      const choices = emojis.slice(0, fight.bots.length);
      const predictionIndex = predictions.findIndex(prediction => prediction._id.fight === fight._id);
      try {
        const message = await user.send(createFightEmbed(fight, predictionIndex >= 0 ? predictions[predictionIndex].choice : null));
        const collector = message.awaitReactions((reaction, u) => {
          return u.id === user.id && (reaction.emoji.name === noneEmoji || choices.includes(reaction.emoji.name));
        }, {time: 60000, max: 1});
        for (const choice of choices) {
          await message.react(choice);
        }
        await message.react(noneEmoji);
        const collected = await collector;
        for (let choice = 0; choice < choices.length; choice++) {
          const collectedReaction = collected.get(choices[choice]);
          if (collectedReaction?.users.resolve(user.id)) {
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
        if (collectedReaction?.users.resolve(user.id)) {
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
    }
    if (i === fights.length - 1 && bracketIndex >= 0) {
      const bracket = fights[bracketIndex];
      if ((bracket.bots.length / 2) > 1) {
        const bots = [];
        for (let j = 0; j < (bracket.bots.length / 2); j++) {
          bots.push(predictions.find(prediction => prediction._id.fight === bracket._id + j + 1).choice);
        }
        const numBots = Math.floor(bracket.bots.length / 2);
        let round: string;
        if (numBots >= 16) {
          round = `Round of ${numBots}`;
        } else if (numBots === 8) {
          round = 'Quarterfinals';
        } else if (numBots === 4) {
          round = 'Semifinals';
        } else if (numBots === 2) {
          round = 'Final';
        } else {
          round = 'Bounty';
        }
        const name = bracket.name.replace(/[^ ]+ Bracket Definition/, `${round} Bracket Definition`);
        fights.push({_id: bracket._id + Math.ceil(bracket.bots.length / 2) + 1, name: name, bots: bots, deadline: bracket.deadline});
      }
    }
  }
  user.send(`You have finished predicting the outcome of all currently available fights.\n\nYou may check on your choices or make changes to them using the \`${prefix}predict\` command.`);
};

const handleCommand = async (message: Message) => {
  const slice = message.content.indexOf(' ');
  const cmd = message.content.slice(prefix.length, (slice < 0) ? message.content.length : slice);

  switch (cmd) {
    case 'help':
      handleHelp(message.author);
      break;
    case 'predict':
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(message.author);
      if (member?.roles.cache.get(registeredRoleId)) {
        makePredictions(message.author);
      } else {
        message.author.send(`You must be a Registered BattleBots Prediction League member to execute the \`${prefix}predict\` command.`);
      }
      break;
    case 'leaderboard':
      handleLeaderboard(message.author);
      break;
  }
};

const handleTeams = async (user: User) => {
  const teams = await db.collection('predictions').aggregate()
    .group({_id: '$_id.user', fights: {$push: '$_id.fight'}, size: {$sum: 1}})
    .sort({size: -1})
    .toArray();
  let description = '';
  let page = 0;
  teams.forEach(team => {
    const s = `<@${team._id}> [${team.fights}]\n`;
    if (description.length + s.length <= 2048) {
      description += s;
    } else {
      const embed = new MessageEmbed()
        .setTitle(`Teams ${++page}:`)
        .setDescription(description);

      user.send(embed);
      description = s;
    }
  });
  const embed = new MessageEmbed()
    .setTitle(`Teams ${page == 0 ? '' : page + 1}:`)
    .setDescription(description);

  user.send(embed);
};

const handleLeaderboard = async (user: User) => {
  const predictions = await db.collection('predictions').find().toArray();
  const fights = await db.collection('fights').find({winner: {$exists: true}}).toArray();
  const guild = await client.guilds.fetch(guildId);
  const leaderboard = guild.roles.resolve(registeredRoleId).members.keyArray()
    .map(user => ({user: user, score: 0}));

  predictions.forEach(prediction => {
    const fight = fights.find(fight => fight._id === prediction._id.fight);
    if (fight?.winner === prediction.choice) {
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
  let lastRank = 0;
  for (let i = 0; i < leaderboard.length; i++) {
    if (leaderboard[i].score !== lastScore) {
      lastRank = i;
      lastScore = leaderboard[i].score;
    }
    const s = `**\`#${String(lastRank + 1).padEnd(3)}\​\`** <@${leaderboard[i].user}> \`${leaderboard[i].score} point${leaderboard[i].score === 1 ? '' : 's'}\`\n`;
    if (description.length + s.length <= 2048) {
      description += s;
    } else {
      const embed = new MessageEmbed()
        .setTitle(`Leaderboard ${++page}:`)
        .setDescription(description);

      user.send(embed);
      description = s;
    }
  }
  const embed = new MessageEmbed()
    .setTitle(`Leaderboard ${page == 0 ? '' : page + 1}:`)
    .setDescription(description);

  user.send(embed);
};

const clean = (text: string): string => {
  return text.replace(/`/g, `\`${String.fromCharCode(8203)}`).replace(/@/g, `@${String.fromCharCode(8203)}`).slice(0, 1990);
};

const restart = (): Promise<string> => {
  client.destroy();
  return client.login(token);
};

const handleAdminCommand = async (message: Message) => {
  const slice = message.content.indexOf(' ');
  const cmd = message.content.slice(prefix.length, (slice < 0) ? message.content.length : slice);
  const args = (slice < 0) ? '' : message.content.slice(slice);

  switch (cmd) {
    case 'help':
      handleHelp(message.author);
      break;
    case 'predict':
      makePredictions(message.author);
      break;
    case 'teams':
      handleTeams(message.author);
      break;
    case 'leaderboard':
      handleLeaderboard(message.author);
      break;
    case 'eval':
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
      break;
  }
};

client.on(Constants.Events.CLIENT_READY, () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({
    status: 'online',
    activity: {
      type: 'PLAYING',
      name: `${prefix}help`
    }
  }).catch(console.error);
});

client.on(Constants.Events.MESSAGE_CREATE, async message => {
  if (message.content.startsWith(prefix)) {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(message);
    if (member?.roles.cache.get(adminRoleId)) {
      handleAdminCommand(message);
    } else {
      handleCommand(message);
    }
  }
});

client.on(Constants.Events.DISCONNECT, event => {
  console.error(`Disconnect: ${JSON.stringify(event)}`);
  restart().catch(console.error);
});

client.on(Constants.Events.ERROR, console.error);

client.on(Constants.Events.WARN, console.warn);

MongoClient.connect(dbUri, mongoOptions).then(mongoClient => {
  db = mongoClient.db('battlebots-s5');

  client.login(token).catch(console.error);
}).catch(console.error);
