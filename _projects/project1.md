---
layout: post
title: "Gemini AI Discord Bot"
description: "Discord bot in NodeJS"
image: "/img/post-bg-about.jpg"
date: 2024-08-27
---

This project is a Discord bot developed in Node.js that aims to create a more human-like and interactive presence in Discord servers. 

## Features

- System Information Command: The bot can provide detailed system information about the host machine, including CPU usage, memory usage, disk usage, and the number of removable drives.
- AI-Powered Conversations: Using Google's Gemini AI, the bot can engage in natural language conversations with users. It responds to messages contextually and can initiate conversations on its own.
- Dynamic Personality: The bot randomly selects personality traits for each interaction, making its responses more varied and human-like.
- Context Awareness: It maintains a conversation history for each channel, allowing it to provide more relevant and coherent responses.
- Proactive Engagement: The bot can spontaneously start conversations using predefined conversation starters, adding to its human-like behavior.
- Customizable Interaction Rate: The frequency of the bot's responses and conversation initiations can be adjusted to suit different server environments.
- Secure Configuration: Sensitive information like API keys and tokens are stored in environment variables for security.


## Technologies Used

- NodeJS
- Gemini AI API
- discord.js

## Source Code

{% highlight javascript %}
const { Client, GatewayIntentBits } = require('discord.js');
const si = require('systeminformation');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const PREFIX = '!';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

// Conversation history (limited to last 10 messages per channel)
const conversationHistory = new Map();

// Personality traits
const traits = [
  "curious", "witty", "empathetic", "knowledgeable", "playful",
  "sarcastic", "optimistic", "philosophical", "creative", "analytical"
];

// Random conversation starters
const conversationStarters = [
  "I've been thinking about...",
  "Did anyone else notice that...",
  "I'm curious, what do you all think about...",
  "Here's a random thought:",
  "I can't help but wonder...",
  "Hypothetically speaking, what if...",
  "This might be off-topic, but...",
  "I recently learned that...",
  "Has anyone ever considered...",
  "Just for fun, imagine if..."
];

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  setInterval(initiateConversation, 1000 * 60 * 30); // Initiate conversation every 30 minutes
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  updateConversationHistory(message.channel.id, `${message.author.username}: ${message.content}`);

  if (message.content.startsWith(PREFIX)) {
    const [command, ...args] = message.content.slice(PREFIX.length).trim().split(/ +/);

    if (command === 'sysinfo') {
      await handleSysInfo(message);
    }
  } else {
    if (Math.random() < 0.15) { // 15% chance to respond
      await generateResponse(message);
    }
  }
});

async function handleSysInfo(message) {
  try {
    const cpu = await si.currentLoad();
    const mem = await si.mem();
    const disk = await si.fsSize();
    const drives = await si.blockDevices();

    const removableDrives = drives.filter(drive => 
      drive.removable || drive.type === 'usb' || drive.type === 'sd'
    ).length;

    const info = `
Here's what I found about the system:
• CPU is working at ${cpu.currentLoad.toFixed(2)}% capacity
• Memory is ${((mem.used / mem.total) * 100).toFixed(2)}% full
• Main disk is ${((disk[0].used / disk[0].size) * 100).toFixed(2)}% occupied
• There are ${removableDrives} removable drives connected

Anything else you'd like to know about the system?
    `;

    message.reply(info);
  } catch (error) {
    console.error('Error fetching system information:', error);
    message.reply("Oops! I ran into a snag while fetching that info. Maybe the system is shy today?");
  }
}

async function generateResponse(message) {
  const history = getConversationHistory(message.channel.id);
  const personality = traits[Math.floor(Math.random() * traits.length)];
  
  const prompt = `
You are a friendly AI assistant in a Discord chat. Your personality is ${personality}.
Recent conversation:
${history.join('\n')}

Respond to the last message in a natural, conversational way. Keep your response brief (1-3 sentences).
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    message.reply(response.text());
    updateConversationHistory(message.channel.id, `Bot: ${response.text()}`);
  } catch (error) {
    console.error('Error generating response with Gemini:', error);
  }
}

function updateConversationHistory(channelId, message) {
  if (!conversationHistory.has(channelId)) {
    conversationHistory.set(channelId, []);
  }
  const history = conversationHistory.get(channelId);
  history.push(message);
  if (history.length > 10) {
    history.shift();
  }
}

function getConversationHistory(channelId) {
  return conversationHistory.get(channelId) || [];
}

async function initiateConversation() {
  const channels = client.channels.cache.filter(channel => channel.type === 0); // Text channels
  for (const [_, channel] of channels) {
    if (Math.random() < 0.3) { // 30% chance to initiate in each channel
      const starter = conversationStarters[Math.floor(Math.random() * conversationStarters.length)];
      const personality = traits[Math.floor(Math.random() * traits.length)];
      
      const prompt = `
You are a friendly AI assistant in a Discord chat. Your personality is ${personality}.
Start a conversation with: "${starter}"
Keep your message brief (1-3 sentences) and engaging to encourage responses.
`;

      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        channel.send(response.text());
        updateConversationHistory(channel.id, `Bot: ${response.text()}`);
      } catch (error) {
        console.error('Error generating conversation starter:', error);
      }
    }
  }
}

client.login(process.env.DISCORD_TOKEN);
{% endhighlight %}

Don't forget to create a .env with variables (GOOGLE_API_KEY and DISCORD_TOKEN) for your discord and gemini api tokens.