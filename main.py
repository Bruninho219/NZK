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

    async def setup_hook(self):
        self.atualizar_status_db.start()
        self.snapshot_xp_diario.start()
        self.limpar_servidores_removidos.start()

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

            res = self.supabase.table("bot_config") \
                .select("status_texto, tipo_atividade, status_expira_em") \
                .eq("id", 1) \
                .maybe_single() \
                .execute()

            usar_padrao = True

            if res.data and res.data.get("status_texto"):
                cfg = res.data
                expira_em = cfg.get("status_expira_em")

                expirou = False

                if expira_em:
                    try:
                        expira_dt = datetime.datetime.fromisoformat(
                            expira_em.replace("Z", "+00:00")
                        )

                        expirou = (
                            datetime.datetime.now(datetime.timezone.utc)
                            >= expira_dt
                        )

                    except Exception as e:
                        log_erro("atualizar_status_db_parse_data", e)

                if expirou:
                    try:
                        self.supabase.table("bot_config").update({
                            "status_texto": None,
                            "status_expira_em": None
                        }).eq("id", 1).execute()

                        log_info(
                            "atualizar_status_db",
                            "Status configurado expirou, voltando ao padrão"
                        )

                    except Exception as e:
                        log_erro("atualizar_status_db_expirar", e)

                else:
                    usar_padrao = False

                    texto = cfg["status_texto"]
                    tipo_id = int(
                        cfg.get("tipo_atividade")
                        if cfg.get("tipo_atividade") is not None
                        else 0
                    )

                    if tipo_id == 4:
                        atividade = discord.CustomActivity(name=texto)
                    else:
                        atividade = discord.Activity(
                            type=discord.ActivityType(tipo_id),
                            name=texto
                        )

                    await self.change_presence(activity=atividade)

                    chave_atual = (tipo_id, texto)

                    if chave_atual != self._ultimo_status_aplicado:
                        nome_tipo = (
                            "custom"
                            if tipo_id == 4
                            else discord.ActivityType(tipo_id).name
                        )

                        log_info(
                            "atualizar_status_db",
                            f"Status atualizado: {nome_tipo} -> {texto}"
                        )

                        self._ultimo_status_aplicado = chave_atual

            if usar_padrao:
                await self.change_presence(
                    activity=discord.Activity(
                        type=config.BOT_STATUS_TYPE,
                        name=config.BOT_STATUS_TEXT
                    )
                )

                chave_padrao = ("default", config.BOT_STATUS_TEXT)

                if chave_padrao != self._ultimo_status_aplicado:
                    log_aviso(
                        "atualizar_status_db",
                        "Nenhum status configurado, usando padrão"
                    )

                    self._ultimo_status_aplicado = chave_padrao

        except Exception as e:
            log_erro("atualizar_status_db", e)

    @tasks.loop(time=datetime.time(hour=0, minute=0))
    async def snapshot_xp_diario(self):
        """Salva, à meia-noite, o XP acumulado de todos os usuários (xp_historico,
        um registro por usuário) e o XP total agregado por servidor
        (servidor_xp_historico, um registro por guild) — restaurada aqui depois
        de ter ficado pra trás numa reescrita anterior do bot."""
        try:
            hoje = datetime.date.today().isoformat()

            existente = self.supabase.table("xp_historico")\
                .select("id")\
                .gte("registrado_em", hoje)\
                .limit(1)\
                .execute()

            if existente.data:
                log_aviso("snapshot_xp_diario", "Snapshot de hoje já existe, pulando.")
                return

            res = self.supabase.table("niveis").select("guild_id, user_id, xp, level").execute()

            if not res.data:
                log_aviso("snapshot_xp_diario", "Nenhum dado encontrado para snapshot.")
                return

            # OBS: essa fórmula de XP por nível ((nivel * 100) + 75) também existe
            # em cogs/leveling.py e cogs/commands.py — se um dia mudar a curva de
            # XP, precisa atualizar nos 3 lugares (fica registrado aqui de novo
            # como lembrete, já discutido anteriormente como melhoria futura).
            def calcular_xp_acumulado(level, xp):
                total = 0
                for lvl in range(level):
                    total += (lvl * 100) + 75
                return total + xp

            payload_usuarios = []
            xp_por_servidor = {}

            for row in res.data:
                xp_total = calcular_xp_acumulado(row["level"], row["xp"])
                payload_usuarios.append({
                    "guild_id": row["guild_id"],
                    "user_id": row["user_id"],
                    "xp_total": xp_total,
                })
                xp_por_servidor[row["guild_id"]] = xp_por_servidor.get(row["guild_id"], 0) + xp_total

            self.supabase.table("xp_historico").insert(payload_usuarios).execute()
            log_info("snapshot_xp_diario", f"Snapshot salvo para {len(payload_usuarios)} usuários.")

            payload_servidores = [
                {"guild_id": gid, "xp_total": total}
                for gid, total in xp_por_servidor.items()
            ]
            self.supabase.table("servidor_xp_historico").insert(payload_servidores).execute()
            log_info("snapshot_xp_diario", f"Snapshot agregado salvo para {len(payload_servidores)} servidores.")

        except Exception as e:
            log_erro("snapshot_xp_diario", e)

    # Ordem importa: tabelas "filhas" primeiro, "servidores" por último —
    # respeita as foreign keys sem depender de ON DELETE CASCADE no banco.
    TABELAS_DEPENDENTES_DE_SERVIDOR = [
        "audit_log",
        "level_ups",
        "xp_historico",
        "servidor_xp_historico",
        "conquistas_usuario",
        "conquistas",
        "patentes",
        "servidor_configs",
        "servidor_cargos",
        "servidor_canais",
        "youtube_monitores",
        "twitch_monitores",
        "servidor_admins",
        "niveis",
        "usuarios",
    ]

    @tasks.loop(time=datetime.time(hour=0, minute=10))
    async def limpar_servidores_removidos(self):
        """Roda 1x/dia (10min depois do snapshot, pra não disputar recursos
        no mesmo minuto) e apaga de vez os dados de servidores de onde o bot
        foi removido há mais de 7 dias — prazo de 'arrependimento' pra
        readicionar o bot sem perder nada. Cumpre o que a Política de
        Privacidade já promete ('dados podem ser limpos periodicamente')."""
        try:
            limite = (datetime.datetime.now(datetime.timezone.utc)
                      - datetime.timedelta(days=7)).isoformat()

            res = self.supabase.table("servidores")\
                .select("guild_id")\
                .not_.is_("removido_em", "null")\
                .lt("removido_em", limite)\
                .execute()

            if not res.data:
                return

            for row in res.data:
                gid = row["guild_id"]
                try:
                    for tabela in self.TABELAS_DEPENDENTES_DE_SERVIDOR:
                        self.supabase.table(tabela).delete().eq("guild_id", gid).execute()

                    self.supabase.table("servidores").delete().eq("guild_id", gid).execute()

                    log_info("limpar_servidores_removidos", f"Dados do servidor {gid} apagados (removido há mais de 7 dias).")
                except Exception as e:
                    log_erro("limpar_servidores_removidos_guild", e)

        except Exception as e:
            log_erro("limpar_servidores_removidos", e)

    @atualizar_status_db.before_loop
    async def before_status_loop(self):
        await self.wait_until_ready()

    @snapshot_xp_diario.before_loop
    async def before_snapshot_loop(self):
        await self.wait_until_ready()

    @limpar_servidores_removidos.before_loop
    async def before_limpar_loop(self):
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
    silenciosamente pro usuário — e qualquer outro tipo de erro deixava a
    interação sem resposta nenhuma, parecendo que o comando travou."""
    if isinstance(error, discord.app_commands.MissingPermissions):
        msg = "❌ Você não tem permissão para usar este comando."
    elif isinstance(error, discord.app_commands.CommandOnCooldown):
        msg = f"⏳ Calma aí! Tenta de novo em {error.retry_after:.1f}s."
    elif isinstance(error, discord.app_commands.CheckFailure):
        msg = "❌ Você não pode usar este comando aqui."
    else:
        msg = "❌ Deu um erro inesperado ao rodar esse comando. Já foi registrado."
        log_erro("on_app_command_error", error)

    try:
        if interaction.response.is_done():
            await interaction.followup.send(msg, ephemeral=True)
        else:
            await interaction.response.send_message(msg, ephemeral=True)
    except Exception:
        pass  # interação já expirou/foi respondida em outro lugar, sem problema

token = os.getenv("TOKEN_DISCORD")
if token:
    bot.run(token)
else:
    log_erro("main", Exception("TOKEN_DISCORD não encontrado no .env"))