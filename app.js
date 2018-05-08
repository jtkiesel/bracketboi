const Discord = require('discord.js');
const request = require('request');

const client = new Discord.Client();
const token = process.env.BRACKETBOI_TOKEN;

client.on('ready', () => {
	console.log('I am ready!');
});

client.on('error', console.error);

client.on('message', message => {
});

client.login(token);
