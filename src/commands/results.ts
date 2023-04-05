import {ApplyOptions} from '@sapphire/decorators';
import {Command} from '@sapphire/framework';
import {
  EmbedBuilder,
  userMention,
  type ChatInputCommandInteraction,
} from 'discord.js';
import {fights, type Fight, type Prediction} from '..';
import {discordId} from '../lib/config';
import {Color} from '../lib/embeds';
import {predictFights} from '../lib/fights';

@ApplyOptions<Command.Options>({description: 'Enter fight results'})
export class ResultsCommand extends Command {
  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== discordId) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(Color.Red)
            .setDescription(
              `Only ${userMention(discordId)} can run that command`
            ),
        ],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ephemeral: true});

    const unscoredFights = await fights
      .find({winner: {$exists: false}})
      .toArray();
    if (unscoredFights.length === 0) {
      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setColor(Color.Blue)
            .setDescription('There are no fights available at the moment.'),
        ],
        ephemeral: true,
      });
      return;
    }

    await predictFights(unscoredFights, [], interaction, this.handleResult);
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
      {idHints: []}
    );
  }

  private async handleResult(_: Fight, prediction: Prediction) {
    await fights.updateOne(
      {_id: prediction._id.fight},
      {$set: {winner: prediction.choice}},
      {upsert: true}
    );
  }
}
