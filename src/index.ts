import {Client, Constants, Message, MessageEmbed, User} from 'discord.js';
import {Db, MongoClient} from 'mongodb';
import {inspect} from 'util';
import {databaseName, databaseUri, discordId, discordToken} from './config';

const client = new Client({
  partials: ['CHANNEL'],
  intents: [
    'GUILDS',
    'GUILD_MESSAGES',
    'GUILD_MESSAGE_REACTIONS',
    'DIRECT_MESSAGES',
    'DIRECT_MESSAGE_REACTIONS',
  ],
});
const mongoOptions = {retryWrites: true};
const prefix = '!';
const guildId = '443426769056301057';
const registeredRoleId = '443427905154973698';
const adminRoleId = '443427495098974240';

const emojis = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫'];
const noneEmoji = '❌';
const acceptEmoji = '✅';

let db: Db;

interface Fight {
  readonly _id: number;
  readonly name: string;
  readonly bots: string[];
  readonly deadline: string;
  readonly winner?: string;
  readonly points?: number;
}

interface Prediction {
  readonly _id: {
    readonly user: string;
    readonly fight: number;
  };
  readonly choice: string;
}

const createFightEmbed = (fight: Fight, choice = '') => {
  let description = '';
  fight.bots.forEach(
    (bot, index) =>
      (description += `${emojis[index]} ${bot}${bot === choice ? ' ⬅️' : ''}\n`)
  );
  description += `${noneEmoji} Abstain (automatic 0)${
    choice === '' ? ' ⬅️' : ''
  }`;
  return new MessageEmbed()
    .setTitle(`Who will win ${fight.name}?`)
    .setDescription(description);
};

const createPrediction = (user: string, fight: number, choice = '') => {
  return {
    _id: {
      user,
      fight,
    },
    choice,
  };
};

const getPredictions = (user: User) => {
  return db
    .collection<Prediction>('predictions')
    .find({'_id.user': user.id})
    .sort({'_id.fight': 1})
    .toArray();
};

const handleHelp = (user: User) => {
  user.send(`\`${prefix}help\`: Information about all commands.
\`${prefix}predict\`: Predict the outcome of future fights, and check your predictions for those fights.
\`${prefix}leaderboard\`: Predictors with the highest number of points.`);
};

const handlePrediction = async (prediction: Prediction): Promise<void> => {
  await db
    .collection<Prediction>('predictions')
    .updateOne({_id: prediction._id}, {$set: prediction}, {upsert: true});
};

const handleResult = async (prediction: Prediction): Promise<void> => {
  await db.collection<Fight>('fights').updateOne(
    {
      _id: prediction._id.fight,
    },
    {
      $set: {
        winner: prediction.choice,
      },
    },
    {
      upsert: true,
    }
  );
};

const makePredictions = async (user: User) => {
  const message =
    await user.send(`You are about to make your predictions for the winners of future fights!

Each fight will be presented to you, one at a time, and you must select the \
reaction corresponding to the bot you wish to choose for each fight. You also \
have the option of abstaining from predicting (if, for example, you already \
know the outcome of a particular fight), but **this will cause your score for \
that fight to be 0**.

You will have one minute to make your selection for each fight, and as soon as \
you make each of your selections, your choices are saved. **But don't worry!** \
You can change your predictions at any time (up until each fight's expiration \
time, some predetermined amount of time before the fight airs on TV) by \
executing the \`${prefix}predict\` command again.

An arrow emoji will point to your selection if/when you have made a prediction.

Select the reaction below when you are ready to begin.`);
  message.react(acceptEmoji);
  const collected = await message.awaitReactions({
    filter: (reaction, u) => {
      return u.id === user.id && reaction.emoji.name === acceptEmoji;
    },
    time: 100000,
    max: 1,
  });
  if (collected.size === 0) {
    await message.edit(
      `Sorry, your request timed out. Please send \`${prefix}predict\` again to start over.`
    );
    return;
  }
  const fights = (await db.collection<Fight>('fights').find().toArray()).filter(
    fight => Date.parse(fight.deadline) > Date.now()
  );
  if (fights.length === 0) {
    await user.send('There are no fights available at the moment.');
    return;
  }
  const predictions = (await getPredictions(user)) || [];
  await predictFights(fights, predictions, user, handlePrediction);
  await user.send(`You have finished predicting the outcome of all currently available fights.

You may check on your choices or make changes to them using the \`${prefix}predict\` command.`);
};

const setResults = async (user: User) => {
  const fights = await db
    .collection<Fight>('fights')
    .find({winner: {$exists: false}})
    .toArray();
  if (fights.length === 0) {
    await user.send('There are no fights available at the moment.');
    return;
  }
  await predictFights(fights, [], user, handleResult);
};

const predictFights = async (
  fights: Fight[],
  predictions: Prediction[],
  user: User,
  handlePrediction: (prediction: Prediction) => Promise<void>
) => {
  for (const fight of fights) {
    if (fight.name.includes('Bracket Definition')) {
      const name = fight.name.slice(
        0,
        fight.name.indexOf('Bracket Definition')
      );
      const bots = fight.bots.slice();
      const bracketFights: Fight[] = [];
      for (let j = 0; j < fight.bots.length / 2; j++) {
        const fightNum = fight.bots.length === 2 ? '' : ` ${j + 1}`;
        bracketFights.push({
          _id: fight._id + j + 1,
          name: `${name}${fightNum}`,
          bots: [
            bots.shift() ?? '',
            bots.splice(bots.length - (bots.length % 2 ? 1 : 2), 1)[0],
          ],
          deadline: fight.deadline,
        });
      }
      await predictFights(bracketFights, predictions, user, handlePrediction);
      if (fight.bots.length > 2) {
        const bots: string[] = [];
        for (let j = 0; j < fight.bots.length / 2; j++) {
          bots.push(
            predictions.find(
              prediction => prediction._id.fight === fight._id + j + 1
            )?.choice ?? ''
          );
        }
        const numBots = Math.floor(fight.bots.length / 2);
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
        const name = fight.name.replace(
          /[^ ]+ Bracket Definition/,
          `${round} Bracket Definition`
        );
        const nextRound = [
          {
            _id: fight._id + Math.ceil(fight.bots.length / 2) + 1,
            name,
            bots,
            deadline: fight.deadline,
          },
        ];
        await predictFights(nextRound, predictions, user, handlePrediction);
      }
    } else if (fight.bots[1] === undefined) {
      const predictionIndex = predictions.findIndex(
        prediction => prediction._id.fight === fight._id
      );
      const prediction = createPrediction(user.id, fight._id, fight.bots[0]);
      if (predictionIndex < 0) {
        predictions.push(prediction);
      } else {
        predictions[predictionIndex] = prediction;
      }
    } else {
      const choices = emojis.slice(0, fight.bots.length);
      const predictionIndex = predictions.findIndex(
        prediction => prediction._id.fight === fight._id
      );
      try {
        const message = await user.send({
          embeds: [
            createFightEmbed(
              fight,
              predictionIndex >= 0
                ? predictions[predictionIndex].choice
                : undefined
            ),
          ],
        });
        const collector = message.awaitReactions({
          filter: (reaction, u) => {
            return (
              u.id === user.id &&
              (reaction.emoji.name === noneEmoji ||
                choices.includes(reaction.emoji.name ?? ''))
            );
          },
          time: 60000,
          max: 1,
        });
        for (const choice of choices) {
          await message.react(choice);
        }
        await message.react(noneEmoji);
        const collected = await collector;
        if (collected.size === 0) {
          message.edit({
            content: `Sorry, your request timed out. Your choices up until this point have been saved.
Please send \`${prefix}predict\` again to start over.`,
            embeds: null,
          });
          return;
        }
        const choice = choices.indexOf(collected.first()?.emoji.name ?? '');
        const bot = choice < 0 ? undefined : fight.bots[choice];
        const prediction = createPrediction(user.id, fight._id, bot);
        if (predictionIndex < 0) {
          predictions.push(prediction);
        } else {
          predictions[predictionIndex] = prediction;
        }
        await handlePrediction(prediction);
        message.edit({embeds: [createFightEmbed(fight, bot)]});
      } catch (err) {
        console.error(err);
      }
    }
  }
};

const handleCommand = async (message: Message) => {
  const slice = message.content.indexOf(' ');
  const cmd = message.content.slice(
    prefix.length,
    slice < 0 ? message.content.length : slice
  );

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
        await message.author.send(
          `You must be a Registered BattleBots Prediction League member to execute the \`${prefix}predict\` command.`
        );
      }
      break;
    case 'leaderboard':
      await handleLeaderboard(message.author);
      break;
  }
};

const handleTeams = async (user: User) => {
  const teams = await db
    .collection('predictions')
    .aggregate()
    .group({
      _id: '$_id.user',
      fights: {$push: '$_id.fight'},
      size: {$sum: 1},
    })
    .sort({size: -1})
    .toArray();
  let description = '';
  let page = 0;
  for (const team of teams) {
    const s = `<@${team._id}> [${team.fights}]\n`;
    if (description.length + s.length <= 2048) {
      description += s;
    } else {
      await user.send({
        embeds: [
          new MessageEmbed()
            .setTitle(`Teams ${++page}:`)
            .setDescription(description),
        ],
      });
      description = s;
    }
  }
  const embed = new MessageEmbed()
    .setTitle(`Teams ${page === 0 ? '' : page + 1}:`)
    .setDescription(description);

  await user.send({embeds: [embed]});
};

const handleLeaderboard = async (user: User) => {
  const predictions = await db
    .collection<Prediction>('predictions')
    .find()
    .toArray();
  const fights = await db
    .collection<Fight>('fights')
    .find({winner: {$exists: true}})
    .toArray();
  const guild = await client.guilds.fetch(guildId);
  const leaderboard = guild.roles
    .resolve(registeredRoleId)
    ?.members.map(({id}) => ({user: id, score: 0}));
  if (leaderboard === undefined) {
    throw new Error('Could not obtain registered users');
  }

  predictions.forEach(prediction => {
    const fight = fights.find(({_id}) => _id === prediction._id.fight);
    if (fight?.winner === prediction.choice) {
      const score =
        fight.points !== undefined
          ? fight.points
          : fight.name?.includes('Rumble')
          ? 2
          : 1;
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
    const s = `**\`#${String(lastRank + 1).padEnd(3)}\u200b\`** <@${
      leaderboard[i].user
    }> \`${leaderboard[i].score} point${leaderboard[i].score === 1 ? '' : 's'}\`
`;
    if (description.length + s.length <= 2048) {
      description += s;
    } else {
      await user.send({
        embeds: [
          new MessageEmbed()
            .setTitle(`Leaderboard ${++page}:`)
            .setDescription(description),
        ],
      });
      description = s;
    }
  }
  const embed = new MessageEmbed()
    .setTitle(`Leaderboard${page === 0 ? '' : ` ${page + 1}`}:`)
    .setDescription(description);

  await user.send({embeds: [embed]});
};

const clean = (text: string): string => {
  return text
    .replace(/`/g, `\`${String.fromCharCode(8203)}`)
    .replace(/@/g, `@${String.fromCharCode(8203)}`)
    .slice(0, 1990);
};

const handleAdminCommand = async (message: Message) => {
  const slice = message.content.indexOf(' ');
  const cmd = message.content.slice(
    prefix.length,
    slice < 0 ? message.content.length : slice
  );
  const args = slice < 0 ? '' : message.content.slice(slice);

  switch (cmd) {
    case 'help':
      handleHelp(message.author);
      break;
    case 'predict':
      await makePredictions(message.author);
      break;
    case 'teams':
      await handleTeams(message.author);
      break;
    case 'leaderboard':
      await handleLeaderboard(message.author);
      break;
    case 'results':
      if (message.author.id === discordId) {
        await setResults(message.author);
      }
      break;
    case 'eval':
      if (message.author.id === '197781934116569088') {
        try {
          let evaled = /\s*await\s+/.test(args)
            ? await eval(`const f = async () => {\n${args}\n};\nf();`)
            : eval(args);
          if (typeof evaled !== 'string') {
            evaled = inspect(evaled);
          }
          await message.channel.send(`\`\`\`xl\n${clean(evaled)}\`\`\``);
        } catch (error) {
          await message.channel.send(
            `\`ERROR\` \`\`\`xl\n${clean(String(error))}\`\`\``
          );
        }
      } else {
        await message.reply("you don't have permission to run that command.");
      }
      break;
  }
};

client.on(Constants.Events.CLIENT_READY, () => {
  console.log(`Logged in as ${client.user?.tag}`);
  client.user?.setActivity({name: `${prefix}help`, type: 'LISTENING'});
});

client.on(Constants.Events.MESSAGE_CREATE, async message => {
  if (message.content.startsWith(prefix)) {
    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(message);
      if (member?.roles.cache.get(adminRoleId)) {
        await handleAdminCommand(message);
      } else {
        await handleCommand(message);
      }
    } catch (error) {
      console.error(error);
    }
  }
});

client.on(Constants.Events.ERROR, console.error);

client.on(Constants.Events.WARN, console.warn);

MongoClient.connect(databaseUri, mongoOptions)
  .then(mongoClient => {
    db = mongoClient.db(databaseName);

    client.login(discordToken).catch(console.error);
  })
  .catch(console.error);
