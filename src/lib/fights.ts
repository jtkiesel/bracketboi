import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type {Fight, Prediction} from '..';

const emojis = ['🇦', '🇧', '🇨', '🇩', '🇪', '🇫'];
const noneEmoji = '❌';

export const predictFights = async (
  fights: Fight[],
  predictions: Prediction[],
  interaction: ChatInputCommandInteraction,
  handlePrediction: (
    fight: Fight,
    prediction: Prediction,
    interaction: ChatInputCommandInteraction
  ) => Promise<void>
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
      await predictFights(
        bracketFights,
        predictions,
        interaction,
        handlePrediction
      );
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
        await predictFights(
          nextRound,
          predictions,
          interaction,
          handlePrediction
        );
      }
    } else if (fight.bots[1] === undefined) {
      const predictionIndex = predictions.findIndex(
        prediction => prediction._id.fight === fight._id
      );
      const prediction = createPrediction(
        interaction.user.id,
        fight._id,
        fight.bots[0]
      );
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
      const reply = await interaction.editReply({
        embeds: [
          createFightEmbed(
            fight,
            predictionIndex >= 0
              ? predictions[predictionIndex].choice
              : undefined
          ),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().setComponents(
            ...choices.map(choice =>
              new ButtonBuilder()
                .setCustomId(choice)
                .setStyle(ButtonStyle.Primary)
                .setEmoji(choice)
            ),
            new ButtonBuilder()
              .setCustomId(noneEmoji)
              .setStyle(ButtonStyle.Danger)
              .setEmoji(noneEmoji)
          ),
        ],
      });
      const collected = await reply.awaitMessageComponent({
        componentType: ComponentType.Button,
      });
      await collected.deferUpdate();
      const choice = collected.component.emoji?.name;
      const bot = choice ? fight.bots[choices.indexOf(choice)] : undefined;
      const prediction = createPrediction(interaction.user.id, fight._id, bot);
      if (predictionIndex < 0) {
        predictions.push(prediction);
      } else {
        predictions[predictionIndex] = prediction;
      }
      await handlePrediction(fight, prediction, interaction);
      await interaction.editReply({
        embeds: [createFightEmbed(fight, bot)],
      });
    }
  }
};

const createFightEmbed = (fight: Fight, choice?: string) => {
  return new EmbedBuilder()
    .setTitle(`Who will win ${fight.name}?`)
    .setDescription(
      [
        ...fight.bots.map((bot, i) =>
          [emojis[i], bot, bot === choice ? ' ⬅️' : ''].join(' ')
        ),
        `${noneEmoji} Abstain (automatic 0)${!choice ? ' ⬅️' : ''}`,
      ].join('\n')
    );
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
