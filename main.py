import os
import datetime
import discord
from discord.ext import commands, tasks
from supabase import create_client
from dotenv import load_dotenv
import config
from logger import log_info, log_erro, log_aviso

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase_client = create_client(url, key)

intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.guilds = True
intents.reactions = True
intents.voice_states = True

# Gera todos os horários "redondos" de 5 em 5 minutos do dia (00:00, 00:05, ..., 23:55).
# Usado pelo loop de status pra rodar sempre alinhado ao relógio, em vez de
# contar 5 minutos a partir da hora que o bot ligou.
HORARIOS_STATUS = [datetime.time(hour=h, minute=m) for h in range(24) for m in range(0, 60, 5)]


class MoraxBot(commands.Bot):
    def __init__(self):
        super().__init__(
            command_prefix=config.PREFIX,
            intents=intents,
            case_insensitive=True  # !nRank, !nrank, !NRANK... todos funcionam igual
        )
        self.supabase = supabase_client
        self._ultimo_status_aplicado = None  # (tipo_id, texto) — evita relogar/reaplicar à toa
        self._ultimo_status_aplicado = None  # (tipo_id, texto) — pra evitar log repetido

    async def setup_hook(self):
        self.atualizar_status_db.start()

        modulos = ['cogs.leveling', 'cogs.commands', 'cogs.sync', 'cogs.youtube', 'cogs.twitch']
        for modulo in modulos:
            try:
                await self.load_extension(modulo)
                log_info("setup_hook", f"📦 Módulo {modulo} carregado!")
            except Exception as e:
                log_erro("setup_hook", e)

        # Registra os slash commands (/comando) no Discord.
        # A primeira sincronização global pode levar até ~1h pra aparecer
        # em todo lugar — isso é limitação do próprio Discord, não do bot.
        try:
            sincronizados = await self.tree.sync()
            log_info("setup_hook", f"🔄 {len(sincronizados)} slash commands sincronizados!")
        except Exception as e:
            log_erro("tree.sync", e)

    @tasks.loop(time=HORARIOS_STATUS)
    async def atualizar_status_db(self):
        try:
            if not self.guilds:
                return

            guild_id = "602623690206609418"  # Nazarick

            res = self.supabase.table("servidor_configs") \
                .select("status_texto, tipo_atividade, status_expira_em") \
                .eq("guild_id", guild_id) \
                .execute()

            usar_padrao = True

            if res.data and res.data[0].get('status_texto'):
                cfg = res.data[0]
                expira_em = cfg.get('status_expira_em')

                expirou = False
                if expira_em:
                    try:
                        expira_dt = datetime.datetime.fromisoformat(expira_em.replace('Z', '+00:00'))
                        expirou = datetime.datetime.now(datetime.timezone.utc) >= expira_dt
                    except Exception as e:
                        log_erro("atualizar_status_db_parse_data", e)

                if expirou:
                    # Limpa o status vencido no banco, pro dashboard também refletir
                    try:
                        self.supabase.table("servidor_configs").update({
                            "status_texto": None,
                            "status_expira_em": None
                        }).eq("guild_id", guild_id).execute()
                        log_info("atualizar_status_db", "Status configurado expirou, voltando ao padrão")
                    except Exception as e:
                        log_erro("atualizar_status_db_expirar", e)
                else:
                    usar_padrao = False
                    texto = cfg['status_texto']
                    tipo_id = cfg.get('tipo_atividade') if cfg.get('tipo_atividade') is not None else 0
                    tipo_formatado = discord.ActivityType(int(tipo_id))

                    await self.change_presence(
                        activity=discord.Activity(type=tipo_formatado, name=texto)
                    )

                    # Só loga quando o status muda de verdade — reaplicar o mesmo
                    # texto a cada 5min é necessário (combate um bug do próprio
                    # Discord que às vezes apaga status customizado sozinho), mas
                    # não precisa poluir o log toda vez que não muda nada.
                    chave_atual = (tipo_id, texto)
                    if chave_atual != self._ultimo_status_aplicado:
                        log_info("atualizar_status_db", f"Status atualizado: {tipo_formatado.name} -> {texto}")
                        self._ultimo_status_aplicado = chave_atual

            if usar_padrao:
                await self.change_presence(
                    activity=discord.Activity(type=config.BOT_STATUS_TYPE, name=config.BOT_STATUS_TEXT)
                )
                chave_padrao = ('default', config.BOT_STATUS_TEXT)
                if chave_padrao != self._ultimo_status_aplicado:
                    log_aviso("atualizar_status_db", "Nenhum status configurado, usando padrão")
                    self._ultimo_status_aplicado = chave_padrao
        except Exception as e:
            log_erro("atualizar_status_db", e)

    @atualizar_status_db.before_loop
    async def before_status_loop(self):
        await self.wait_until_ready()

bot = MoraxBot()

@bot.event
async def on_ready():
    print("---")
    print(f"✅ {bot.user} online!")
    print(f"🌍 Servidores: {len(bot.guilds)}")
    print("---")

@bot.event
async def on_app_command_error(interaction: discord.Interaction, error):
    """Trata erros de slash commands (equivalente ao on_command_error, mas
    pra comandos '/'). Sem isso, erro de permissão em slash command falha
    silenciosamente pro usuário."""
    if isinstance(error, discord.app_commands.MissingPermissions):
        msg = "❌ Você não tem permissão para usar este comando."
        if interaction.response.is_done():
            await interaction.followup.send(msg, ephemeral=True)
        else:
            await interaction.response.send_message(msg, ephemeral=True)
    else:
        log_erro("on_app_command_error", error)

token = os.getenv("TOKEN_DISCORD")
if token:
    bot.run(token)
else:
    log_erro("main", Exception("TOKEN_DISCORD não encontrado no .env"))
