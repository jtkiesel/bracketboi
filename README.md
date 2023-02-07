# bracketboi

Discord bot that collects BattleBots fight predictions from members of the BattleBots Prediction League server.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

- [Node.js](https://nodejs.org/)
- [Yarn](https://yarnpkg.com/)

### Environment Variables

|    Variable     | Required |                Default                 |                 Description                 |
| :-------------: | :------: | :------------------------------------: | :-----------------------------------------: |
|  `DISCORD_ID`   |    ✓     |                                        |   Id of the bot manager's Discord account   |
| `DISCORD_TOKEN` |    ✓     |                                        | Token of the Discord account to log in with |
|    `ROLE_ID`    |    ✓     |                                        |      Id of the predictors Discord role      |
|   `SERVER_ID`   |    ✓     |                                        |     Id of the prediction Discord server     |
|   `LOG_LEVEL`   |          |                 `INFO`                 |              Minimum log level              |
|   `MONGO_URL`   |          | `mongodb://localhost:27017/bracketboi` |        MongoDB server connection URI        |
|   `NODE_ENV`    |          |             `development`              |       Node.JS application environment       |

### Installing

Install dependencies

```sh-session
yarn install
```

Start the bot

```sh-session
yarn dev
```

## Running the tests

```sh-session
yarn test
```

## Deployment

Install dependencies

```sh-session
yarn install
```

Compile source

```sh-session
yarn build
```

Start the bot

```sh-session
yarn start
```

## Versioning

We use [SemVer](https://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/jtkiesel/vexibot/tags).

## Authors

- **Jordan Kiesel** - [LinkedIn](https://www.linkedin.com/in/jtkiesel/)

See also the list of [contributors](https://github.com/jtkiesel/bracketboi/contributors) who participated in this project.

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
