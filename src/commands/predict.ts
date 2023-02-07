import {EmbedBuilder} from '@discordjs/builders';
import {ApplyOptions} from '@sapphire/decorators';
import {Command} from '@sapphire/framework';
import type {ChatInputCommandInteraction} from 'discord.js';
import {fights, predictions, type Fight, type Prediction} from '..';
import {Color} from '../lib/embeds';
import {predictFights} from '../lib/fights';

@ApplyOptions<Command.Options>({description: 'Predict upcoming fights'})
export class PredictCommand extends Command {
  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ephemeral: true});

    const upcomingFights = (await fights.find().toArray()).filter(
      fight => Date.parse(fight.deadline) > Date.now()
    );
    if (upcomingFights.length === 0) {
      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor(Color.Blue)
            .setDescription('There are no fights to predict at the moment.'),
        ],
        ephemeral: true,
      });
      return;
    }

    const userPredictions = await predictions
      .find({'_id.user': interaction.user.id})
      .sort({'_id.fight': 1})
      .toArray();
    await predictFights(
      upcomingFights,
      userPredictions,
      interaction,
      this.handlePrediction
    );
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(Color.Green)
          .setDescription(
            [
              'You have finished predicting the outcome of all currently available fights.',
              'You may check on your choices or make changes to them using the `/predict` command.',
            ].join('\n\n')
          ),
      ],
      components: [],
    });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(
      command => command.setName(this.name).setDescription(this.description),
      {idHints: ['1068374265910542357']}
    );
  }

  private async handlePrediction(
    fight: Fight,
    prediction: Prediction,
    interaction: ChatInputCommandInteraction
  ) {
    if (Date.now() > Date.parse(fight.deadline)) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(Color.Red)
            .setDescription('Sorry, the deadline to predict fights has passed'),
        ],
        components: [],
      });
      throw new Error('The deadline to predict fights has passed');
    }
    await predictions.updateOne(
      {_id: prediction._id},
      {$set: prediction},
      {upsert: true}
    );
  }
}
