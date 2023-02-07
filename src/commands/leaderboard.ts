import {bold, hyperlink, inlineCode} from '@discordjs/builders';
import {ApplyOptions} from '@sapphire/decorators';
import {PaginatedMessage} from '@sapphire/discord.js-utilities';
import {Command} from '@sapphire/framework';
import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type Collection,
  type GuildMember,
} from 'discord.js';
import {fights, predictions} from '..';
import {serverId} from '../lib/config';
import {Color} from '../lib/embeds';
import {userUrl} from '../lib/user';

@ApplyOptions<Command.Options>({description: 'Get prediction leaderboard'})
export class LeaderboardCommand extends Command {
  private static readonly PageSize = 10;
  private static readonly RankEmojis = ['🥇', '🥈', '🥉'];
  private static readonly ZeroWidthSpace = '\u200B';
  private static readonly PaddingL = `${LeaderboardCommand.ZeroWidthSpace} `;
  private static readonly PaddingR =
    ` ${LeaderboardCommand.ZeroWidthSpace}`.repeat(4);

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ephemeral: true});

    const scoredFights = await fights.find({winner: {$exists: true}}).toArray();
    const leaderboardUsers = new Array<LeaderboardUser>();

    await predictions.find().forEach(prediction => {
      const fight = scoredFights.find(({_id}) => _id === prediction._id.fight);
      if (fight?.winner === prediction.choice) {
        const score = fight.points ?? fight.name?.includes('Rumble') ? 2 : 1;
        const team = leaderboardUsers.find(
          team => team.user === prediction._id.user
        );
        if (team) {
          team.score += score;
        } else {
          leaderboardUsers.push({user: prediction._id.user, score});
        }
      }
    });

    leaderboardUsers.sort((a, b) => b.score - a.score);

    const guild = await interaction.client.guilds.fetch(serverId);
    const members = await guild.members.fetch({
      user: leaderboardUsers.map(({user}) => user),
    });

    const paginatedMessage = new PaginatedMessage({
      template: new EmbedBuilder()
        .setColor(Color.Green)
        .setTitle('Prediction Leaderboard'),
    });
    Array.from(
      {
        length: Math.ceil(
          leaderboardUsers.length / LeaderboardCommand.PageSize
        ),
      },
      (_, i) =>
        leaderboardUsers.slice(
          i * LeaderboardCommand.PageSize,
          (i + 1) * LeaderboardCommand.PageSize
        )
    )
      .map((users, page) => this.embedFrom(page, users, members))
      .forEach(embed => paginatedMessage.addPageEmbed(embed));
    paginatedMessage.run(interaction);
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(
      command => command.setName(this.name).setDescription(this.description),
      {idHints: ['1068190563226108046']}
    );
  }

  private embedFrom(
    page: number,
    users: LeaderboardUser[],
    members: Collection<string, GuildMember>
  ) {
    const start = page * LeaderboardCommand.PageSize;
    return new EmbedBuilder().setDescription(
      users
        .map(({user, score}, i) => [
          this.formatRank(start + i),
          this.formatUser(members, user),
          inlineCode(`${score} points`),
        ])
        .map(columns => columns.join(' '))
        .join('\n')
    );
  }

  private formatRank(index: number) {
    return index < LeaderboardCommand.RankEmojis.length
      ? [
          LeaderboardCommand.PaddingL,
          LeaderboardCommand.RankEmojis[index],
          LeaderboardCommand.PaddingR,
        ].join('')
      : bold(inlineCode(`#${String(index + 1).padEnd(3)}`));
  }

  private formatUser(
    members: Collection<string, GuildMember>,
    userId: string
  ): string {
    const member = members.get(userId);
    return hyperlink(
      member?.nickname ?? member?.user.username ?? userId,
      userUrl(userId)
    );
  }
}

interface LeaderboardUser {
  user: string;
  score: number;
}
