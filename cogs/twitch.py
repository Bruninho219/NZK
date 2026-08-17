import discord
from discord.ext import commands, tasks
from logger import log_info, log_erro
import aiohttp
import os
import time

TWITCH_CLIENT_ID = os.getenv("TWITCH_CLIENT_ID")
TWITCH_CLIENT_SECRET = os.getenv("TWITCH_CLIENT_SECRET")


class Twitch(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.supabase = bot.supabase
        self._token = None
        self._token_expira_em = 0
        self.verificar_streams.start()

    def cog_unload(self):
        self.verificar_streams.cancel()

    async def _obter_token(self, session):
        """Pega (ou renova) o token de app da Twitch (client credentials)."""
        if self._token and time.time() < self._token_expira_em:
            return self._token

        if not TWITCH_CLIENT_ID or not TWITCH_CLIENT_SECRET:
            log_erro("twitch_token", Exception("TWITCH_CLIENT_ID/SECRET não configurados no .env"))
            return None

        try:
            async with session.post("https://id.twitch.tv/oauth2/token", params={
                "client_id": TWITCH_CLIENT_ID,
                "client_secret": TWITCH_CLIENT_SECRET,
                "grant_type": "client_credentials"
            }, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                data = await resp.json()
                if resp.status != 200 or "access_token" not in data:
                    log_erro("twitch_token", Exception(f"Falha ao obter token: {data}"))
                    return None
                self._token = data["access_token"]
                # Renova um pouco antes de expirar de verdade
                self._token_expira_em = time.time() + data.get("expires_in", 3600) - 300
                return self._token
        except Exception as e:
            log_erro("twitch_token", e)
            return None

    async def _buscar_streams_ao_vivo(self, session, headers, usernames):
        """Busca quem está ao vivo, paginando em blocos de 100 —
        a API da Twitch ignora silenciosamente qualquer user_login
        além do 100º numa mesma chamada."""
        ao_vivo_agora = {}
        for i in range(0, len(usernames), 100):
            bloco = usernames[i:i + 100]
            params = [("user_login", u) for u in bloco]
            async with session.get(
                "https://api.twitch.tv/helix/streams",
                headers=headers,
                params=params,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status != 200:
                    log_erro("verificar_streams", Exception(f"Status {resp.status} da API da Twitch"))
                    continue
                data = await resp.json()
                ao_vivo_agora.update({s["user_login"].lower(): s for s in data.get("data", [])})
        return ao_vivo_agora

    @tasks.loop(minutes=5)
    async def verificar_streams(self):
        try:
            res = self.supabase.table("twitch_monitores").select("*").eq("ativo", True).execute()
            if not res.data:
                return

            async with aiohttp.ClientSession() as session:
                token = await self._obter_token(session)
                if not token:
                    return

                headers = {
                    "Client-Id": TWITCH_CLIENT_ID,
                    "Authorization": f"Bearer {token}"
                }

                monitores = res.data
                usernames = [m["twitch_username"].lower() for m in monitores]

                ao_vivo_agora = await self._buscar_streams_ao_vivo(session, headers, usernames)

                for monitor in monitores:
                    username = monitor["twitch_username"].lower()
                    estava_ao_vivo = monitor.get("estava_ao_vivo", False)
                    esta_ao_vivo = username in ao_vivo_agora

                    if esta_ao_vivo and not estava_ao_vivo:
                        await self._anunciar(monitor, ao_vivo_agora[username])

                    if esta_ao_vivo != estava_ao_vivo:
                        self.supabase.table("twitch_monitores")\
                            .update({"estava_ao_vivo": esta_ao_vivo})\
                            .eq("id", monitor["id"]).execute()

        except Exception as e:
            log_erro("verificar_streams", e)

    async def _anunciar(self, monitor, stream_info):
        try:
            guild = self.bot.get_guild(int(monitor["guild_id"]))
            if not guild:
                return
            canal = guild.get_channel(int(monitor["discord_channel_id"]))
            if not canal:
                return

            username = monitor["twitch_username"]
            titulo = stream_info.get("title", "Sem título")
            jogo = stream_info.get("game_name", "")
            thumb = stream_info.get("thumbnail_url", "").replace("{width}", "1280").replace("{height}", "720")

            embed = discord.Embed(
                title=titulo,
                url=f"https://twitch.tv/{username}",
                description=f"**{username}** está ao vivo na Twitch!" + (f"\n🎮 {jogo}" if jogo else ""),
                color=0x9146FF
            )
            if thumb:
                embed.set_image(url=f"{thumb}?t={int(time.time())}")
            embed.set_footer(text="Twitch")

            await canal.send(embed=embed)
            log_info("Twitch", f"{username} ficou ao vivo — anunciado em {guild.name}")
        except Exception as e:
            log_erro("_anunciar (twitch)", e)

    @verificar_streams.before_loop
    async def before_loop(self):
        await self.bot.wait_until_ready()


async def setup(bot):
    await bot.add_cog(Twitch(bot))