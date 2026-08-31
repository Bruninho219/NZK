import discord
from logger import log_info, log_erro, log_aviso
from discord.ext import commands, tasks
import datetime

# xp_cooldown: antes, cooldowns eram fixos em 15s/5s no código, então 60s de
# folga era suficiente. Agora que são configuráveis por servidor (podem ser
# maiores), uma folga generosa evita apagar uma entrada de cooldown ainda
# válida antes da hora — o que faria o cooldown configurado "não funcionar"
# de verdade acima desse limite, silenciosamente.
LIMPEZA_XP_COOLDOWN_SEGUNDOS = 3600

# voice_tracker: uma sessão de voz normal dura o tempo que durar (não é pra
# limpar por idade). Esse limite é só uma válvula de segurança pra entradas
# "presas" por algum evento perdido (ex: bot reiniciou no meio de uma sessão
# de voz, ou o membro saiu do servidor sem disparar o evento de saída de voz).
LIMPEZA_VOICE_TRACKER_HORAS = 12

# Cooldown de mensagem/reação são checados a cada evento (potencialmente
# várias vezes por segundo em servidor movimentado) — por isso o valor
# configurado por servidor fica em cache, revalidado só a cada 60s, em vez
# de consultar o banco em toda mensagem/reação.
CONFIG_COOLDOWN_CACHE_TTL_SEGUNDOS = 60
COOLDOWN_MENSAGEM_PADRAO = 15
COOLDOWN_REACAO_PADRAO = 5

class Leveling(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.supabase = bot.supabase
        self.voice_tracker = {}
        self.xp_cooldown = {}  # {"msg_uid" ou "reacao_uid": datetime}
        self._config_cooldown_cache = {}  # {guild_id: {"data": (msg, reacao), "ts": datetime}}
        self.limpar_caches.start()

    def cog_unload(self):
        self.limpar_caches.cancel()

    @tasks.loop(minutes=30)
    async def limpar_caches(self):
        """Remove entradas velhas de xp_cooldown e voice_tracker, evitando
        que esses dicionários cresçam pra sempre num bot rodando 24/7."""
        try:
            agora = datetime.datetime.now()

            expirados_cooldown = [
                chave for chave, quando in self.xp_cooldown.items()
                if (agora - quando).total_seconds() > LIMPEZA_XP_COOLDOWN_SEGUNDOS
            ]
            for chave in expirados_cooldown:
                del self.xp_cooldown[chave]

            expirados_voice = [
                uid for uid, quando in self.voice_tracker.items()
                if (agora - quando).total_seconds() > LIMPEZA_VOICE_TRACKER_HORAS * 3600
            ]
            for uid in expirados_voice:
                del self.voice_tracker[uid]

            if expirados_cooldown or expirados_voice:
                log_info(
                    "limpar_caches",
                    f"Removidos {len(expirados_cooldown)} cooldowns e {len(expirados_voice)} rastreios de voz presos"
                )
        except Exception as e:
            log_erro("limpar_caches", e)

    @limpar_caches.before_loop
    async def before_limpar_caches(self):
        await self.bot.wait_until_ready()

    async def garantir_servidor_e_usuario(self, guild_id: str, user_id: str, username: str):
        """Garante que as chaves estrangeiras existam em servidores e usuarios antes de manipular niveis."""
        try:
            self.supabase.table("servidores").upsert({"guild_id": guild_id}).execute()
            self.supabase.table("usuarios").upsert({
                "user_id": user_id,
                "guild_id": guild_id,
                "username": username
            }).execute()
        except Exception as e:
            log_erro("garantir_servidor_e_usuario", e)

    async def obter_cooldowns(self, gid: str):
        """Retorna (cooldown_mensagem, cooldown_reacao) em segundos pro
        servidor, com cache de 60s — evita consultar o banco a cada
        mensagem/reação, já que esses eventos podem ser muito frequentes."""
        agora = datetime.datetime.now()
        cache = self._config_cooldown_cache.get(gid)
        if cache and (agora - cache["ts"]).total_seconds() < CONFIG_COOLDOWN_CACHE_TTL_SEGUNDOS:
            return cache["data"]

        cooldown_msg, cooldown_reacao = COOLDOWN_MENSAGEM_PADRAO, COOLDOWN_REACAO_PADRAO
        try:
            res = self.supabase.table("servidor_configs")\
                .select("cooldown_mensagem_segundos, cooldown_reacao_segundos")\
                .eq("guild_id", gid).execute()
            if res.data:
                cfg = res.data[0]
                cooldown_msg = int(cfg.get("cooldown_mensagem_segundos") or COOLDOWN_MENSAGEM_PADRAO)
                cooldown_reacao = int(cfg.get("cooldown_reacao_segundos") or COOLDOWN_REACAO_PADRAO)
        except Exception as e:
            log_erro("obter_cooldowns", e)

        resultado = (cooldown_msg, cooldown_reacao)
        self._config_cooldown_cache[gid] = {"data": resultado, "ts": agora}
        return resultado

    async def buscar_cargo_por_nivel(self, guild_id, nivel_atual):
        try:
            res = self.supabase.table("patentes")\
                .select("role_id")\
                .eq("guild_id", str(guild_id))\
                .lte("level_required", nivel_atual)\
                .order("level_required", desc=True)\
                .limit(1)\
                .execute()
            return res.data[0]['role_id'] if res.data else None
        except Exception as e:
            log_erro("buscar_cargo_por_nivel", e)
            return None

    async def gerenciar_cargo_top1(self, guild):
        """Verifica quem é o Top 1 e atribui o cargo especial, removendo dos outros."""
        try:
            conf = self.supabase.table("servidor_configs")\
                .select("cargo_top1_id")\
                .eq("guild_id", str(guild.id))\
                .execute()
            if not conf.data or not conf.data[0]['cargo_top1_id']:
                return

            role_id = int(conf.data[0]['cargo_top1_id'])
            role_especial = guild.get_role(role_id)
            if not role_especial:
                return

            res = self.supabase.table("niveis")\
                .select("user_id")\
                .eq("guild_id", str(guild.id))\
                .order("level", desc=True)\
                .order("xp", desc=True)\
                .limit(1)\
                .execute()
            if not res.data:
                return

            top_user_id = int(res.data[0]['user_id'])

            for member in role_especial.members:
                if member.id != top_user_id:
                    await member.remove_roles(role_especial)

            novo_top_member = guild.get_member(top_user_id)
            if novo_top_member and role_especial not in novo_top_member.roles:
                await novo_top_member.add_roles(role_especial)
        except Exception as e:
            log_erro("gerenciar_cargo_top1", e)

    async def verificar_conquistas(self, user, guild, gid, uid, valores_atuais, channel=None):
        """Checa se algum critério de conquista do servidor foi atingido com
        os valores atuais do usuário (msg_count, voice_minutes, reacoes, level)
        e concede as que ainda não tinha. v1: sem vínculo de cargo, só o selo
        (registro em conquistas_usuario) + anúncio opcional no canal."""
        try:
            conquistas_res = self.supabase.table("conquistas")\
                .select("id, nome, emoji, criterio_tipo, criterio_valor")\
                .eq("guild_id", gid)\
                .execute()

            if not conquistas_res.data:
                return

            obtidas_res = self.supabase.table("conquistas_usuario")\
                .select("conquista_id")\
                .eq("guild_id", gid)\
                .eq("user_id", uid)\
                .execute()
            ids_obtidas = {c["conquista_id"] for c in (obtidas_res.data or [])}

            novas = [
                c for c in conquistas_res.data
                if c["id"] not in ids_obtidas
                and c["criterio_tipo"] in valores_atuais
                and valores_atuais[c["criterio_tipo"]] >= c["criterio_valor"]
            ]

            for c in novas:
                try:
                    self.supabase.table("conquistas_usuario").insert({
                        "guild_id": gid,
                        "user_id": uid,
                        "conquista_id": c["id"]
                    }).execute()

                    log_info("verificar_conquistas", f"{user} desbloqueou '{c['nome']}' em {guild.name}")

                    destino = channel or None
                    if destino:
                        emoji = c.get("emoji") or "🏆"
                        await destino.send(f"{emoji} **{user.mention}** desbloqueou a conquista **{c['nome']}**!")
                except Exception as e:
                    # Se a conquista já tiver sido concedida por outra chamada
                    # concorrente (ex: mensagem + reação quase juntas), o
                    # UNIQUE(guild_id, user_id, conquista_id) rejeita o insert
                    # duplicado — não é um erro real, só ignora.
                    log_erro("verificar_conquistas_insert", e)
        except Exception as e:
            log_erro("verificar_conquistas", e)


    @commands.Cog.listener()
    async def on_guild_remove(self, guild):
        """Registra quando o bot é removido de um servidor."""
        try:
            self.supabase.table("servidores").update({
                "removido_em": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }).eq("guild_id", str(guild.id)).execute()
            log_info("on_guild_remove", f"Bot removido de {guild.name} ({guild.id})")
        except Exception as e:
            log_erro("on_guild_remove", e)

    @commands.Cog.listener()
    async def on_guild_join(self, guild):
        """Limpa a data de remoção quando o bot volta para um servidor."""
        try:
            self.supabase.table("servidores").upsert({
                "guild_id": str(guild.id),
                "removido_em": None
            }).execute()
            log_info("on_guild_join", f"Bot adicionado em {guild.name} ({guild.id})")
        except Exception as e:
            log_erro("on_guild_join", e)

    @commands.Cog.listener()
    async def on_member_join(self, member):
        """Boas-vindas e cargos automáticos ao entrar no servidor."""
        if member.bot:
            return  # cargos automáticos e boas-vindas só pra gente de verdade

        guild = member.guild
        gid = str(guild.id)

        try:
            cfg = self.supabase.table("servidor_configs")\
                .select("canal_boas_vindas_id, boas_vindas_mensagem, cargos_entrada")\
                .eq("guild_id", gid).execute()

            if not cfg.data:
                return

            c = cfg.data[0]
        except Exception as e:
            log_erro("on_member_join_config", e)
            return

        # Cargos automáticos ao entrar — em try separado: se o cargo do bot
        # estiver ABAIXO de algum cargo configurado na hierarquia do
        # servidor, o Discord recusa com 403 Forbidden. Isso não pode
        # impedir a mensagem de boas-vindas de ser enviada logo abaixo.
        cargos_ids = c.get("cargos_entrada") or []
        if cargos_ids:
            try:
                cargos = [guild.get_role(int(rid)) for rid in cargos_ids]
                cargos = [r for r in cargos if r]
                if cargos:
                    await member.add_roles(*cargos, reason="Cargo automático de entrada")
            except discord.Forbidden:
                log_aviso(
                    "on_member_join_cargos",
                    f"Sem permissão pra atribuir cargo de entrada em {guild.name} ({gid}) — "
                    f"o cargo do bot precisa estar ACIMA dos cargos de entrada na hierarquia."
                )
            except Exception as e:
                log_erro("on_member_join_cargos", e)

        # Mensagem de boas-vindas — independente do resultado da parte acima.
        try:
            canal_id = c.get("canal_boas_vindas_id")
            if canal_id:
                canal = guild.get_channel(int(canal_id))
                if canal:
                    mensagem_raw = c.get("boas_vindas_mensagem") or "Bem-vindo(a) ao {servidor}, {usuario}!"
                    mensagem = mensagem_raw\
                        .replace("{usuario}", member.mention)\
                        .replace("{servidor}", guild.name)\
                        .replace("{membros}", str(guild.member_count))

                    embed = discord.Embed(
                        description=mensagem,
                        color=0x5865f2
                    )
                    embed.set_author(name=member.display_name, icon_url=member.display_avatar.url)
                    embed.set_footer(text=f"Membro #{guild.member_count}")
                    await canal.send(embed=embed)
        except Exception as e:
            log_erro("on_member_join_boasvindas", e)

    @commands.Cog.listener()
    async def on_member_update(self, before, after):
        """Detecta quando um membro impulsiona o servidor."""
        if before.premium_since is None and after.premium_since is not None:
            guild = after.guild
            gid = str(guild.id)

            try:
                cfg = self.supabase.table("servidor_configs")\
                    .select("canal_boost_id, bonus_boost_xp, boost_mensagem, boost_afeta_bonus_admin")\
                    .eq("guild_id", gid).execute()

                canal_id = cfg.data[0].get("canal_boost_id") if cfg.data else None
                bonus_xp = int(cfg.data[0].get("bonus_boost_xp") or 0) if cfg.data else 0
                afeta_admin = cfg.data[0].get("boost_afeta_bonus_admin", True) if cfg.data else True

                if canal_id:
                    canal = guild.get_channel(int(canal_id))
                    if canal:
                        mensagem_raw = cfg.data[0].get("boost_mensagem") or "{usuario} acabou de impulsionar o servidor! Obrigado pelo apoio!"
                        mensagem = mensagem_raw\
                            .replace("{usuario}", after.mention)\
                            .replace("{servidor}", guild.name)\
                            .replace("{xp}", str(bonus_xp))

                        embed = discord.Embed(
                            title="💜 Novo Impulso!",
                            description=mensagem,
                            color=0xff73fa
                        )
                        embed.set_thumbnail(url=after.display_avatar.url)
                        if bonus_xp > 0:
                            embed.add_field(name="🎁 Recompensa", value=f"**+{bonus_xp} XP** de bônus!", inline=False)
                        await canal.send(embed=embed)

                if bonus_xp > 0:
                    await self.adicionar_xp(after, guild, None, "manual", xp_extra=bonus_xp, aplicar_bonus_admin=afeta_admin)
                    log_info("on_member_update", f"Boost detectado: {after.name} recebeu +{bonus_xp} XP")

            except Exception as e:
                log_erro("on_member_update", e)

    @commands.Cog.listener()
    async def on_message(self, message):
        if message.author.bot or not message.guild:
            return

        comandos_ignorados = ["!nrank", "!nsync", "!nsync2", "!setchannel", "!nhelp", "!nstatus", "!nping", "!nping2", "!ntop", "!nadmin", "!nfix", "!nbonus", "!nhistorico", "!nhistorico2"]
        if message.content.lower().startswith(tuple(comandos_ignorados)):
            return
        if len(message.content.strip()) < 3:
            return

        uid = str(message.author.id)
        agora = datetime.datetime.now()
        cooldown_msg, _ = await self.obter_cooldowns(str(message.guild.id))
        if uid in self.xp_cooldown and (agora - self.xp_cooldown[uid]).total_seconds() < cooldown_msg:
            return

        self.xp_cooldown[uid] = agora
        await self.adicionar_xp(message.author, message.guild, message.channel, "mensagem")

    @commands.Cog.listener()
    async def on_reaction_add(self, reaction, user):
        # Nota: reaction.count é o TOTAL de reações daquele emoji na mensagem
        # (somando todo mundo), não quantas vezes esse usuário reagiu — por isso
        # não é usado aqui como filtro. O cooldown abaixo (por usuário+mensagem)
        # já impede farm de XP removendo e reagindo de novo repetidamente.
        if user.bot or not reaction.message.guild:
            return

        rk = f"react_{user.id}_{reaction.message.id}"
        agora = datetime.datetime.now()
        _, cooldown_reacao = await self.obter_cooldowns(str(reaction.message.guild.id))
        if rk in self.xp_cooldown and (agora - self.xp_cooldown[rk]).total_seconds() < cooldown_reacao:
            return

        self.xp_cooldown[rk] = agora
        await self.adicionar_xp(user, reaction.message.guild, None, "reacao")

    @commands.Cog.listener()
    async def on_voice_state_update(self, member, before, after):
        if member.bot:
            return
        uid = str(member.id)

        if before.channel is None and after.channel is not None:
            self.voice_tracker[uid] = datetime.datetime.now()
        elif before.channel is not None and after.channel is None:
            if uid in self.voice_tracker:
                entrada = self.voice_tracker.pop(uid)
                minutos = int((datetime.datetime.now() - entrada).total_seconds() / 60)
                if minutos > 0:
                    await self.adicionar_xp(member, member.guild, None, "voz", minutos_voz=minutos)

    async def adicionar_xp(self, user, guild, channel, tipo, minutos_voz=0, xp_extra=None, aplicar_bonus_admin=True):
        """
        tipo: 'mensagem', 'reacao', 'voz' ou 'manual' (usado por boost/bônus avulsos, junto com xp_extra)
        aplicar_bonus_admin: se False, o bônus de % de admin não é aplicado a esse ganho específico
                              (o bônus de booster continua valendo normalmente, se aplicável)
        """
        uid, gid = str(user.id), str(guild.id)
        nickname = user.display_name

        await self.garantir_servidor_e_usuario(gid, uid, nickname)

        try:
            # Busca configuração de bônus e taxas de XP do servidor
            cfg_res = self.supabase.table("servidor_configs")\
                .select("bonus_booster, bonus_admin, bonus_stack, xp_mensagem, xp_reacao, xp_voz_minuto")\
                .eq("guild_id", gid).execute()

            cfg = cfg_res.data[0] if cfg_res.data else {}

            xp_mensagem   = int(cfg.get("xp_mensagem")   if cfg.get("xp_mensagem")   is not None else 20)
            xp_reacao     = int(cfg.get("xp_reacao")     if cfg.get("xp_reacao")     is not None else 5)
            xp_voz_minuto = int(cfg.get("xp_voz_minuto") if cfg.get("xp_voz_minuto") is not None else 15)

            if tipo == "mensagem":
                xp_ganho = xp_mensagem
            elif tipo == "reacao":
                xp_ganho = xp_reacao
            elif tipo == "voz":
                xp_ganho = xp_voz_minuto * minutos_voz
            elif tipo == "manual":
                xp_ganho = xp_extra or 0
            else:
                xp_ganho = 0

            if xp_ganho <= 0:
                return

            bonus_booster = int(cfg.get("bonus_booster") or 0)
            bonus_admin   = int(cfg.get("bonus_admin") or 0)
            bonus_stack   = cfg.get("bonus_stack", True)

            eh_booster = bool(getattr(user, "premium_since", None))
            eh_admin   = isinstance(user, discord.Member) and user.guild_permissions.administrator and aplicar_bonus_admin

            bonus_pct = 0
            if eh_booster and eh_admin:
                bonus_pct = (bonus_booster + bonus_admin) if bonus_stack else max(bonus_booster, bonus_admin)
            elif eh_booster:
                bonus_pct = bonus_booster
            elif eh_admin:
                bonus_pct = bonus_admin

            if bonus_pct > 0:
                xp_ganho = int(xp_ganho * (1 + bonus_pct / 100))

            res = self.supabase.table("niveis").select("*").eq("guild_id", gid).eq("user_id", uid).execute()

            if not res.data:
                self.supabase.table("niveis").insert({
                    "guild_id": gid,
                    "user_id": uid,
                    "xp": xp_ganho,
                    "level": 0,
                    "msg_count": 1 if tipo == "mensagem" else 0,
                    "voice_minutes": minutos_voz,
                    "reacoes": 1 if tipo == "reacao" else 0
                }).execute()
                await self.verificar_conquistas(user, guild, gid, uid, {
                    "msg_count": 1 if tipo == "mensagem" else 0,
                    "voice_minutes": minutos_voz,
                    "reacoes": 1 if tipo == "reacao" else 0,
                    "level": 0
                }, channel)
                return

            d = res.data[0]
            novo_xp = d['xp'] + xp_ganho
            novo_level = d['level']
            level_inicial = d['level']

            while novo_xp >= (novo_level * 100) + 75:
                novo_xp -= (novo_level * 100) + 75
                novo_level += 1

            update_data = {
                "xp": int(novo_xp),
                "level": int(novo_level),
                "msg_count": d['msg_count'] + (1 if tipo == "mensagem" else 0),
                "voice_minutes": (d.get('voice_minutes', 0) or 0) + minutos_voz,
                "reacoes": (d.get('reacoes', 0) or 0) + (1 if tipo == "reacao" else 0)
            }

            self.supabase.table("niveis").update(update_data).eq("guild_id", gid).eq("user_id", uid).execute()

            await self.verificar_conquistas(user, guild, gid, uid, update_data, channel)

            if novo_level > level_inicial:
                rid = await self.buscar_cargo_por_nivel(gid, novo_level)
                if rid:
                    role_nova = guild.get_role(int(rid))
                    if role_nova:
                        try:
                            res_p = self.supabase.table("patentes").select("role_id").eq("guild_id", gid).execute()
                            ids_patentes_banco = {int(p['role_id']) for p in res_p.data}

                            cargos_do_usuario = {r.id for r in user.roles}
                            ids_para_remover = (ids_patentes_banco & cargos_do_usuario) - {role_nova.id}

                            cargos_para_remover = [guild.get_role(r_id) for r_id in ids_para_remover]
                            cargos_para_remover = [r for r in cargos_para_remover if r]

                            if cargos_para_remover:
                                await user.remove_roles(*cargos_para_remover, reason="Atualização de Patente NZK")

                            if role_nova not in user.roles:
                                await user.add_roles(role_nova, reason="Alcançou uma nova patente!")

                        except discord.Forbidden:
                            log_aviso("adicionar_xp", "Erro de Permissão: cargo do Bot precisa estar ACIMA das patentes")
                        except Exception as e:
                            log_erro("adicionar_xp_cargos", e)

                try:
                    self.supabase.table("level_ups").insert({
                        "guild_id": gid,
                        "user_id": uid,
                        "level_atingido": int(novo_level)
                    }).execute()
                except Exception as e:
                    log_erro("level_ups insert", e)

                try:
                    config_res = self.supabase.table("servidor_configs")\
                        .select("canal_avisos_id, levelup_mensagem")\
                        .eq("guild_id", gid)\
                        .execute()
                    canal_id = config_res.data[0]['canal_avisos_id'] if config_res.data else None
                    canal_destino = guild.get_channel(int(canal_id)) if canal_id else channel

                    if canal_destino:
                        mensagem_raw = (config_res.data[0].get('levelup_mensagem') if config_res.data else None) \
                            or "{usuario} >> **{nivel}**"
                        mensagem = mensagem_raw\
                            .replace("{usuario}", user.mention)\
                            .replace("{nivel}", str(novo_level))\
                            .replace("{servidor}", guild.name)
                        await canal_destino.send(mensagem)
                except Exception as e:
                    log_erro("level_up anuncio", e)

            await self.gerenciar_cargo_top1(guild)

        except Exception as e:
            log_erro("Leveling", e)

async def setup(bot):
    await bot.add_cog(Leveling(bot))
