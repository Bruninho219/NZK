import discord
from logger import log_info, log_erro, log_aviso
from discord.ext import commands
import datetime

class Leveling(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.supabase = bot.supabase
        self.voice_tracker = {}
        self.xp_cooldown = {}  # {"msg_uid" ou "reacao_uid": datetime}

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


    @commands.Cog.listener()
    async def on_guild_remove(self, guild):
        """Registra quando o bot é removido de um servidor."""
        try:
            self.supabase.table("servidores").update({
                "removido_em": datetime.datetime.utcnow().isoformat()
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

            # Cargos automáticos ao entrar
            cargos_ids = c.get("cargos_entrada") or []
            if cargos_ids:
                cargos = [guild.get_role(int(rid)) for rid in cargos_ids]
                cargos = [r for r in cargos if r]
                if cargos:
                    await member.add_roles(*cargos, reason="Cargo automático de entrada")

            # Mensagem de boas-vindas
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
            log_erro("on_member_join", e)

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
        if uid in self.xp_cooldown and (agora - self.xp_cooldown[uid]).total_seconds() < 15:
            return

        self.xp_cooldown[uid] = agora
        await self.adicionar_xp(message.author, message.guild, message.channel, "mensagem")

    @commands.Cog.listener()
    async def on_reaction_add(self, reaction, user):
        if user.bot or not reaction.message.guild:
            return
        if reaction.count > 1:
            return

        rk = f"react_{user.id}_{reaction.message.id}"
        agora = datetime.datetime.now()
        if rk in self.xp_cooldown and (agora - self.xp_cooldown[rk]).total_seconds() < 5:
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
