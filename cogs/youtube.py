import discord
from discord.ext import commands, tasks
from logger import log_erro
import aiohttp
import xml.etree.ElementTree as ET

RSS_URL = "https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
RSS_HANDLE_URL = "https://www.youtube.com/feeds/videos.xml?user={handle}"

async def resolver_canal_id(session, entrada):
    """Resolve @handle, URL ou ID direto para um channel_id UC..."""
    entrada = entrada.strip()

    # Extrai handle ou ID de URLs completas
    if "youtube.com" in entrada:
        if "/@" in entrada:
            entrada = entrada.split("/@")[1].split("/")[0]
            if not entrada.startswith("@"):
                entrada = "@" + entrada
        elif "/channel/" in entrada:
            return entrada.split("/channel/")[1].split("/")[0]
        elif "/user/" in entrada:
            entrada = entrada.split("/user/")[1].split("/")[0]

    # Já é um channel ID
    if entrada.startswith("UC") and len(entrada) > 20:
        return entrada

    # É um @handle — tenta via RSS handle
    handle = entrada.lstrip("@")
    try:
        url = RSS_HANDLE_URL.format(handle=handle)
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status == 200:
                text = await resp.text()
                root = ET.fromstring(text)
                ns = {'yt': 'http://www.youtube.com/xml/schemas/2015'}
                ch = root.find('yt:channelId', ns)
                if ch is not None:
                    return ch.text
    except Exception:
        pass

    # Fallback — tenta via página do canal
    try:
        url = f"https://www.youtube.com/@{handle}"
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status == 200:
                text = await resp.text()
                import re
                match = re.search(r'"channelId":"(UC[^"]+)"', text)
                if match:
                    return match.group(1)
    except Exception:
        pass

    return None

class YouTube(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.supabase = bot.supabase
        self.verificar_videos.start()

    def cog_unload(self):
        self.verificar_videos.cancel()

    @tasks.loop(minutes=5)
    async def verificar_videos(self):
        try:
            res = self.supabase.table("youtube_monitores")\
                .select("*")\
                .eq("ativo", True)\
                .execute()

            if not res.data:
                return

            async with aiohttp.ClientSession() as session:
                for monitor in res.data:
                    await self._checar_canal(session, monitor)

        except Exception as e:
            log_erro("verificar_videos", e)

    async def _checar_canal(self, session, monitor):
        try:
            url = RSS_URL.format(channel_id=monitor['youtube_channel_id'])
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return
                text = await resp.text()

            root = ET.fromstring(text)
            ns = {'atom': 'http://www.w3.org/2005/Atom', 'yt': 'http://www.youtube.com/xml/schemas/2015'}

            entries = root.findall('atom:entry', ns)
            if not entries:
                return

            ultimo = entries[0]
            video_id = ultimo.find('yt:videoId', ns).text
            titulo   = ultimo.find('atom:title', ns).text
            link     = ultimo.find('atom:link', ns).get('href')
            autor    = ultimo.find('atom:author/atom:name', ns).text

            # Primeiro registro — só salva sem anunciar
            if not monitor['ultimo_video_id']:
                self.supabase.table("youtube_monitores")\
                    .update({"ultimo_video_id": video_id})\
                    .eq("id", monitor['id']).execute()
                return

            # Já visto
            if video_id == monitor['ultimo_video_id']:
                return

            # Novo vídeo!
            self.supabase.table("youtube_monitores")\
                .update({"ultimo_video_id": video_id})\
                .eq("id", monitor['id']).execute()

            guild = self.bot.get_guild(int(monitor['guild_id']))
            if not guild:
                return

            canal = guild.get_channel(int(monitor['discord_channel_id']))
            if not canal:
                return

            embed = discord.Embed(
                title=titulo,
                url=link,
                description=f"**{autor}** publicou um novo vídeo!",
                color=0xff0000
            )
            embed.set_image(url=f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg")
            embed.set_footer(text="YouTube")

            await canal.send(embed=embed)

        except Exception as e:
            log_erro(f"_checar_canal ({monitor.get('youtube_channel_id')})", e)

    @verificar_videos.before_loop
    async def before_loop(self):
        await self.bot.wait_until_ready()

async def setup(bot):
    await bot.add_cog(YouTube(bot))