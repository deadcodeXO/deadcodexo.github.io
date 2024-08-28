---
layout: post
title: "Discord Article Management Bot"
description: "A Python-based Discord bot for creating, editing, and managing articles"
image: "/img/post-bg-about.jpg"
date: 2024-08-28
---

This project is a Discord bot designed to help server members create, manage, and share multi-page articles directly within Discord channels.

## Features

- **Multi-page Article Creation**: Users can create articles with multiple pages, each containing text and an optional image.

- **Article Viewing**: Articles can be viewed page by page with an interactive navigation system using reaction emojis.

- **Image Support**: Each page can include an image, displayed as a thumbnail in the top-right corner of the embed.

- **Tagging System**: Articles can be tagged for easy categorization and improved searchability.

- **Search Functionality**: Users can search for articles by title, content, or tags.

- **Article Management**: Full CRUD (Create, Read, Update, Delete) operations for articles.

- **List View**: Users can see a list of all available articles in the server.

- **Embedded Responses**: All bot responses use Discord embeds for a clean and consistent look.

## Technologies Used

- Python
- discord.py
- TinyDB (for lightweight database management)
- asyncio (for asynchronous programming)

## Commands

- `!articles create`: Start the interactive process of creating a new article.
- `!articles view <article_id>`: Display an article with its pages and images.
- `!articles edit <article_id>`: Edit an existing article.
- `!articles delete <article_id>`: Remove an article from the database.
- `!articles list`: Show all available articles.
- `!articles search <query>`: Find articles based on a search query.
- `!articles tag <article_id> <tags>`: Add or update tags for an article.

## Source Code

[GitHub Repository](https://github.com/yourusername/discord-article-bot)

This Discord bot project aims to provide a seamless way for community members to share and manage long-form content within Discord servers. It's particularly useful for communities that frequently share tutorials, guides, or any other type of multi-page content.

The bot uses TinyDB as a lightweight, file-based database, making it easy to set up and manage without the need for external database servers. The asynchronous design ensures efficient handling of Discord events and user interactions.

We welcome contributions and suggestions for improving the bot's functionality. Feel free to explore the source code, submit issues, or contribute to the project!

## Full Source Code

Here's the full source code for the Discord Article Management Bot:

your_project_folder/  
&nbsp;   ├── bot.py  
&nbsp;   ├── config.ini  
&nbsp;   └── commands/  
&nbsp; &nbsp;     └── articles.py  

config.ini:
```json
[Bot]
Token = YOUR_DISCORD_BOT_TOKEN
```
requirements.txt
```json
discord.py
yfinance
requests
configparser
```

bot.py
```python
import os
import discord
from discord.ext import commands
import configparser
import logging
import asyncio

# Set up logging
logging.basicConfig(level=logging.INFO)

# Read configuration
config = configparser.ConfigParser()
config.read('config.ini')

# Set the Google AI API key as an environment variable
os.environ['GOOGLE_AI_API_KEY'] = config['Google']['AIApiKey']

# Set up intents
intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix='!', intents=intents, help_command=None)

class CustomHelpCommand(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.command()
    async def help(self, ctx, *args):
        if not args:
            # General help command
            embed = discord.Embed(title="Bot Help", description="Here are the available modules:", color=discord.Color.blue())
            for extension in bot.extensions:
                cog = bot.get_cog(extension.split('.')[-1].capitalize())
                if cog and hasattr(cog, 'description'):
                    embed.add_field(name=extension.split('.')[-1].capitalize(), value=cog.description, inline=False)
            embed.set_footer(text="Use !help <module> for more information on a specific module.")
            await ctx.send(embed=embed)
        else:
            # Specific module help
            module_name = args[0].lower()
            cog = bot.get_cog(module_name.capitalize())
            if cog:
                embed = discord.Embed(title=f"{module_name.capitalize()} Module", description=cog.description, color=discord.Color.green())
                for command in cog.get_commands():
                    embed.add_field(name=command.name, value=command.help or "No description available.", inline=False)
                await ctx.send(embed=embed)
            else:
                await ctx.send(f"Module '{module_name}' not found.")

@bot.event
async def on_ready():
    print(f'{bot.user} has connected to Discord!')
    print(f'Loaded commands: {", ".join([cmd.name for cmd in bot.commands])}')

async def load_extensions():
    for filename in os.listdir('./commands'):
        if filename.endswith('.py') and not filename.startswith('__'):
            try:
                await bot.load_extension(f'commands.{filename[:-3]}')
                print(f'Loaded extension: {filename}')
            except Exception as e:
                print(f'Failed to load extension {filename}: {e}')

@bot.event
async def on_command_error(ctx, error):
    if isinstance(error, commands.CommandNotFound):
        await ctx.send(f"Command not found. Use !help to see available commands.")
    else:
        logging.error(f"An error occurred: {error}")

@bot.command()
@commands.is_owner()
async def load(ctx, extension):
    try:
        await bot.load_extension(f'commands.{extension}')
        await ctx.send(f'Loaded {extension}')
    except Exception as e:
        await ctx.send(f'Error loading {extension}: {e}')

@bot.command()
@commands.is_owner()
async def unload(ctx, extension):
    try:
        await bot.unload_extension(f'commands.{extension}')
        await ctx.send(f'Unloaded {extension}')
    except Exception as e:
        await ctx.send(f'Error unloading {extension}: {e}')

@bot.command()
@commands.is_owner()
async def reload(ctx, extension):
    try:
        await bot.reload_extension(f'commands.{extension}')
        await ctx.send(f'Reloaded {extension}')
    except Exception as e:
        await ctx.send(f'Error reloading {extension}: {e}')

async def main():
    async with bot:
        await bot.add_cog(CustomHelpCommand(bot))
        await load_extensions()
        await bot.start(config['Bot']['Token'])

asyncio.run(main())
```

articles.py
```python
import discord
from discord.ext import commands
from tinydb import TinyDB, Query
from datetime import datetime
import asyncio
import re

class Articles(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.db = TinyDB('articles_db.json')
        self.articles = self.db.table('articles')

    description = "This module provides commands to manage multi-page articles with photos, tags, and search functionality."

    @commands.group(invoke_without_command=True)
    async def articles(self, ctx):
        """Manage articles. Use subcommands: list, create, edit, delete, view, search, tag"""
        await ctx.send("Use `!articles list/create/edit/delete/view/search/tag` to manage articles.")

    @articles.command()
    async def list(self, ctx):
        """List all articles"""
        articles_list = self.articles.all()
        
        if not articles_list:
            await ctx.send("No articles found.")
            return
        
        embed = discord.Embed(title="Articles", color=discord.Color.blue())
        for article in articles_list:
            tags = ', '.join(article.get('tags', []))
            embed.add_field(name=f"ID: {article.doc_id} - {article['title']}", 
                            value=f"Tags: {tags}" if tags else "No tags", 
                            inline=False)
        await ctx.send(embed=embed)

    @articles.command()
    async def create(self, ctx):
        """Create a new article"""
        await ctx.send("Let's create a new article. What's the title?")
        
        def check(m):
            return m.author == ctx.author and m.channel == ctx.channel

        try:
            title_msg = await self.bot.wait_for('message', check=check, timeout=60.0)
            title = title_msg.content

            pages = []
            while True:
                await ctx.send("Enter the content for this page, or type 'done' to finish:")
                content_msg = await self.bot.wait_for('message', check=check, timeout=300.0)
                if content_msg.content.lower() == 'done':
                    break
                
                page_content = content_msg.content
                
                await ctx.send("Any photos for this page? Send them now or type 'none'.")
                photo_msg = await self.bot.wait_for('message', check=check, timeout=60.0)
                photos = [att.url for att in photo_msg.attachments] if photo_msg.attachments else []
                
                pages.append({
                    'content': page_content,
                    'photos': photos
                })

            await ctx.send("Enter tags for this article (comma-separated):")
            tags_msg = await self.bot.wait_for('message', check=check, timeout=60.0)
            tags = [tag.strip() for tag in tags_msg.content.split(',') if tag.strip()]

            article = {
                'title': title,
                'pages': pages,
                'tags': tags,
                'created_at': datetime.now().isoformat(),
                'author_id': ctx.author.id
            }
            doc_id = self.articles.insert(article)

            await ctx.send(f"Article created with ID: {doc_id}")
        except asyncio.TimeoutError:
            await ctx.send("You took too long to respond. Article creation cancelled.")

    @articles.command()
    async def view(self, ctx, article_id: int):
        """View a specific article"""
        Article = Query()
        article = self.articles.get(doc_id=article_id)

        if not article:
            await ctx.send("Article not found.")
            return

        pages = article['pages']
        current_page = 0

        message = await self.send_article_page(ctx, article, pages[current_page], current_page)

        await message.add_reaction("⬅️")
        await message.add_reaction("➡️")

        def check(reaction, user):
            return user == ctx.author and str(reaction.emoji) in ["⬅️", "➡️"] and reaction.message.id == message.id

        while True:
            try:
                reaction, user = await self.bot.wait_for("reaction_add", timeout=60.0, check=check)

                if str(reaction.emoji) == "➡️" and current_page < len(pages) - 1:
                    current_page += 1
                    await message.edit(embed=self.create_article_embed(article, pages[current_page], current_page))
                elif str(reaction.emoji) == "⬅️" and current_page > 0:
                    current_page -= 1
                    await message.edit(embed=self.create_article_embed(article, pages[current_page], current_page))

                await message.remove_reaction(reaction, user)

            except asyncio.TimeoutError:
                await message.clear_reactions()
                break

    async def send_article_page(self, ctx, article, page, page_number):
        embed = self.create_article_embed(article, page, page_number)
        return await ctx.send(embed=embed)

    def create_article_embed(self, article, page, page_number):
        embed = discord.Embed(title=article['title'], description=page['content'], color=discord.Color.green())
        embed.set_footer(text=f"Page {page_number + 1}/{len(article['pages'])}")
        tags = ', '.join(article.get('tags', []))
        if tags:
            embed.add_field(name="Tags", value=tags, inline=False)
        
        if page['photos']:
            embed.set_thumbnail(url=page['photos'][0])

        return embed

    @articles.command()
    async def edit(self, ctx, article_id: int):
        """Edit an existing article"""
        Article = Query()
        article = self.articles.get(doc_id=article_id)

        if not article:
            await ctx.send("Article not found.")
            return

        await ctx.send(f"Editing article {article_id}. What's the new title? (Type 'skip' to keep current)")
        
        def check(m):
            return m.author == ctx.author and m.channel == ctx.channel

        try:
            title_msg = await self.bot.wait_for('message', check=check, timeout=60.0)
            if title_msg.content.lower() != 'skip':
                article['title'] = title_msg.content

            await ctx.send("Do you want to edit pages? (yes/no)")
            edit_pages_msg = await self.bot.wait_for('message', check=check, timeout=60.0)
            if edit_pages_msg.content.lower() == 'yes':
                article['pages'] = []
                while True:
                    await ctx.send("Enter the content for this page, or type 'done' to finish:")
                    content_msg = await self.bot.wait_for('message', check=check, timeout=300.0)
                    if content_msg.content.lower() == 'done':
                        break
                    
                    page_content = content_msg.content
                    
                    await ctx.send("Any photos for this page? Send them now or type 'none'.")
                    photo_msg = await self.bot.wait_for('message', check=check, timeout=60.0)
                    photos = [att.url for att in photo_msg.attachments] if photo_msg.attachments else []
                    
                    article['pages'].append({
                        'content': page_content,
                        'photos': photos
                    })

            await ctx.send("Enter new tags for this article (comma-separated), or type 'skip' to keep current:")
            tags_msg = await self.bot.wait_for('message', check=check, timeout=60.0)
            if tags_msg.content.lower() != 'skip':
                article['tags'] = [tag.strip() for tag in tags_msg.content.split(',') if tag.strip()]

            article['edited_at'] = datetime.now().isoformat()
            self.articles.update(article, doc_ids=[article_id])

            await ctx.send(f"Article {article_id} has been updated.")
        except asyncio.TimeoutError:
            await ctx.send("You took too long to respond. Article editing cancelled.")

    @articles.command()
    async def delete(self, ctx, article_id: int):
        """Delete an article"""
        Article = Query()
        result = self.articles.remove(doc_ids=[article_id])

        if not result:
            await ctx.send("Article not found.")
        else:
            await ctx.send(f"Article {article_id} has been deleted.")

    @articles.command()
    async def search(self, ctx, *, query: str):
        """Search for articles by title, content, or tags"""
        Article = Query()
        results = self.articles.search(
            (Article.title.search(query, flags=re.IGNORECASE)) |
            (Article.pages.any(lambda page: page['content'].search(query, flags=re.IGNORECASE))) |
            (Article.tags.any(lambda tag: tag.search(query, flags=re.IGNORECASE)))
        )

        if not results:
            await ctx.send("No articles found matching your search.")
            return

        embed = discord.Embed(title=f"Search Results for '{query}'", color=discord.Color.blue())
        for article in results:
            tags = ', '.join(article.get('tags', []))
            embed.add_field(name=f"ID: {article.doc_id} - {article['title']}", 
                            value=f"Tags: {tags}" if tags else "No tags", 
                            inline=False)
        await ctx.send(embed=embed)

    @articles.command()
    async def tag(self, ctx, article_id: int, *, tags: str):
        """Add or update tags for an article"""
        Article = Query()
        article = self.articles.get(doc_id=article_id)

        if not article:
            await ctx.send("Article not found.")
            return

        new_tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
        article['tags'] = new_tags
        self.articles.update({'tags': new_tags}, doc_ids=[article_id])

        await ctx.send(f"Tags for article {article_id} have been updated: {', '.join(new_tags)}")

async def setup(bot):
    await bot.add_cog(Articles(bot))
```

