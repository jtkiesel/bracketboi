import {ApplyOptions} from '@sapphire/decorators';
import {Command} from '@sapphire/framework';
import {EmbedBuilder, type ChatInputCommandInteraction} from 'discord.js';
import {DurationUnit} from '../lib/duration';
import {Color} from '../lib/embeds';

@ApplyOptions<Command.Options>({
  description: 'Get time since bot last restarted',
})
export class UptimeCommand extends Command {
  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ephemeral: true});

    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor(Color.Blue)
          .setDescription(
            `🕒 Uptime: ${this.format(interaction.client.uptime)}`
          ),
      ],
      ephemeral: true,
    });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(
      command => command.setName(this.name).setDescription(this.description),
      {idHints: ['1068190566212435978']}
    );
  }

  private format(milliseconds: number) {
    return DurationUnit.values()
      .map(unit => ({unit, value: unit.fromMilliseconds(milliseconds)}))
      .filter(({value}) => value > 0)
      .map(({unit, value}) => unit.format(value))
      .join(', ');
  }
}
