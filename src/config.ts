import {AssertionError} from 'assert';
import {config} from 'dotenv';

config();

function assertIsString(
  name: string,
  value: string | undefined
): asserts value is string {
  if (value === undefined) {
    throw new AssertionError({
      message: `Required environment variable not set: ${name}`,
    });
  }
}

const required = (name: string): string => {
  const value = process.env[name];
  assertIsString(name, value);
  return value;
};

export const databaseName = required('DATABASE_NAME');
export const databaseUri = required('DATABASE_URI');
export const discordId = process.env.DISCORD_ID;
export const discordToken = required('DISCORD_TOKEN');
