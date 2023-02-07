import {
  ApplicationCommandRegistries,
  RegisterBehavior,
  SapphireClient,
} from '@sapphire/framework';
import '@sapphire/plugin-logger/register';
import {GatewayIntentBits, Options, Partials} from 'discord.js';
import {MongoClient} from 'mongodb';
import 'source-map-support/register';
import {mongoUrl, logLevel} from './lib/config';

const mongoClient = new MongoClient(mongoUrl);
const database = mongoClient.db();

export const fights = database.collection<Fight>('fights');
export const predictions = database.collection<Prediction>('predictions');

export interface Fight {
  readonly _id: number;
  readonly name: string;
  readonly bots: string[];
  readonly deadline: string;
  readonly winner?: string;
  readonly points?: number;
}

export interface Prediction {
  readonly _id: {
    readonly user: string;
    readonly fight: number;
  };
  readonly choice: string;
}

ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(
  RegisterBehavior.Overwrite
);

const discordClient = new SapphireClient({
  shards: 'auto',
  partials: [Partials.Channel],
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  logger: {level: logLevel},
  makeCache: Options.cacheWithLimits({
    BaseGuildEmojiManager: 0,
    GuildEmojiManager: 0,
    GuildBanManager: 0,
    GuildInviteManager: 0,
    GuildMemberManager: Infinity,
    GuildStickerManager: 0,
    GuildScheduledEventManager: 0,
    MessageManager: 0,
    PresenceManager: 0,
    ReactionManager: 0,
    ReactionUserManager: 0,
    StageInstanceManager: 0,
    ThreadMemberManager: 0,
    VoiceStateManager: 0,
  }),
});

const main = async () => {
  try {
    discordClient.logger.info('Connecting to database');
    await mongoClient.connect();
    discordClient.logger.info('Connected to database');

    discordClient.logger.info('Logging in to Discord');
    await discordClient.login();
    discordClient.logger.info('Logged in to Discord');
  } catch (error) {
    discordClient.logger.fatal(error);
    throw error;
  }
};

process.on('SIGTERM', async () => {
  discordClient.destroy();
  await mongoClient.close();
});

main();
