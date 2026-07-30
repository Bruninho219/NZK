import discord
from logger import log_info, log_erro, log_aviso
from discord.ext import commands
from datetime import datetime

class GeneralCommands(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.supabase = bot.supabase

    def log_acao(self, gid, actor_id, actor_name, acao, target_id=None, detalhes=None):
        try:
            self.supabase.table("audit_log").insert({
                "guild_id": gid,
                "actor_id": actor_id,
                "actor_name": actor_name,
                "action": acao,
                "target_id": target_id,
                "detalhes": detalhes
            }).execute()
        except Exception as e:
            log_erro("audit_log", e)

    @commands.Cog.listener()
    async def on_command_error(self, ctx, error):
        if isinstance(error, commands.MissingPermissions):
            await ctx.send("❌ Você não tem permissão para usar este comando.")

    @commands.command(name="nRank")
    async def rank(self, ctx, target: discord.Member = None):
        target = target or ctx.author
        try:
            res = self.supabase.table("niveis").select("*")\
                .eq("guild_id", str(ctx.guild.id))\
                .eq("user_id", str(target.id)).execute()

            if not res.data:
                return await ctx.send(f"❌ {target.display_name} ainda não tem registros.")

            d = res.data[0]
            xp_prox = (d['level'] * 100) + 75

            ranking = self.supabase.table("niveis").select("user_id")\
                .eq("guild_id", str(ctx.guild.id))\
                .order("level", desc=True)\
                .order("xp", desc=True)\
                .execute()

            posicao = next((i + 1 for i, r in enumerate(ranking.data) if r['user_id'] == str(target.id)), None)

            medalhas = {1: "🥇", 2: "🥈", 3: "🥉"}
            posicao_str = medalhas.get(posicao, f"**#{posicao}**") if posicao else "**-**"

            embed = discord.Embed(title=f"📊 Rank de {target.display_name}", color=0x5865f2)
            embed.set_thumbnail(url=target.display_avatar.url)
            # Formata voz
            voz_min = d.get('voice_minutes', 0) or 0
            if voz_min < 60:
                voz_str = f"{voz_min}m"
            else:
                h = voz_min // 60
                m = voz_min % 60
                voz_str = f"{h}h {m}m" if m > 0 else f"{h}h"

            embed.add_field(name="📈 Nível", value=f"**{d['level']}**", inline=True)
            embed.add_field(name="⭐ XP", value=f"**{d['xp']}/{xp_prox}**", inline=True)
            embed.add_field(name="🏆 Posição", value=posicao_str, inline=True)
            embed.add_field(name="💬 Mensagens", value=f"**{d['msg_count']}**", inline=True)
            embed.add_field(name="🎙️ Voz", value=f"**{voz_str}**", inline=True)
            embed.add_field(name="❤️ Reações", value=f"**{d.get('reacoes', 0) or 0}**", inline=True)

            await ctx.send(embed=embed)

        except Exception as e:
            log_erro("nRank", e)

    @commands.command(name="nTop")
    async def ntop(self, ctx):
        """Mostra o Top 5 do servidor"""
        try:
            res = self.supabase.table("niveis").select("user_id, level, xp")\
                .eq("guild_id", str(ctx.guild.id))\
                .order("level", desc=True)\
                .order("xp", desc=True)\
                .limit(5)\
                .execute()

            if not res.data:
                return await ctx.send("❌ Nenhum usuário registrado ainda.")

            medalhas = {1: "🥇", 2: "🥈", 3: "🥉"}
            embed = discord.Embed(title="🏆 Top 5 do Servidor", color=0x5865f2)

            linhas = []
            for i, entry in enumerate(res.data, start=1):
                member = ctx.guild.get_member(int(entry['user_id']))
                nome = member.display_name if member else f"Usuário {entry['user_id']}"
                posicao = medalhas.get(i, f"**#{i}**")
                linhas.append(f"{posicao} {nome} — Nível **{entry['level']}** ({entry['xp']} XP)")

            embed.description = "\n".join(linhas)
            await ctx.send(embed=embed)

        except Exception as e:
            log_erro("nTop", e)
            await ctx.send("❌ Erro ao buscar o ranking.")

    @commands.command(name="nHelp")
    async def nhelp(self, ctx):
        """Lista todos os comandos do bot"""
        embed = discord.Embed(title="📖 Comandos do Bot", color=0x5865f2)

        embed.add_field(name="👤 Usuário", value=(
            "`!nRank [@usuário]` — Mostra seu nível, XP e posição no ranking\n"
            "`!nTop` — Exibe o Top 5 do servidor\n"
            "`!nHistorico [@usuário]` — Histórico de XP em tabela (30 dias)\n"
            "`!nHistorico2 [@usuário]` — Histórico de XP em gráfico (30 dias)\n"
            "`!nPing` — Latência do bot\n"
            "`!nPing2` — Latência real (ida e volta)\n"
            "`!nInfo` — Informações e versão do bot\n"
        ), inline=False)

        embed.add_field(name="🔧 Admin", value=(
            "`!nAdmin` — Painel com configurações do servidor\n"
            "`!nBonus [tipo] [valor]` — Configura bônus de XP (booster/admin)\n"
            "`!nBonusStack [sim/nao]` —  Define se bônus se somam ou usa o maior\n"
            "`!nReset [@usuário]` — Reseta níveis (todos ou um usuário específico)\n"
            "`!nSetXP @usuário valor` — Define o XP de um usuário\n"
            "`!nSetLevel @usuário valor` — Define o nível de um usuário\n"
            "`!nStatus` — Atualiza o status do bot\n"
            "`!nSync` — Sincroniza cargos e canais no banco\n"
            "`!nSync2` — Atualiza nomes das patentes\n"
            "`!nFix` — Corrige cargos de todos os membros\n"
            "`!setchannel` — Define o canal de anúncios\n"

        ), inline=False)

        embed.set_footer(text="XP: +20 por mensagem (cooldown 15s) • +5 por reação • +15 por minuto em voz")
        await ctx.send(embed=embed)

    @commands.command(name="nStatus")
    @commands.has_permissions(administrator=True)
    async def update_status(self, ctx):
        msg = await ctx.send("🔄 Atualizando status...")

        try:
            traducoes = {
                0: "Jogando",
                2: "Ouvindo",
                3: "Assistindo",
                4: "Balãozinho",
                5: "Competindo"
            }

            guild_id = str(ctx.guild.id)

            res = self.supabase.table("servidor_configs") \
                .select("status_texto, tipo_atividade") \
                .eq("guild_id", guild_id) \
                .execute()

            if res.data and res.data[0].get('status_texto'):
                cfg = res.data[0]
                texto = cfg['status_texto']
                tipo_id = int(cfg.get('tipo_atividade') or 0)

                nome_exibicao = traducoes.get(tipo_id, "Status")

                if tipo_id == 4:
                    atividade = discord.CustomActivity(name=texto)
                else:
                    tipo_formatado = discord.ActivityType(tipo_id)
                    atividade = discord.Activity(type=tipo_formatado, name=texto)

                await self.bot.change_presence(activity=atividade)

                log_info("nStatus", f"Status atualizado: {nome_exibicao} -> {texto} | por {ctx.author}")
                await msg.edit(content=f"✅ Status atualizado para **{nome_exibicao}**: **{texto}**")

            else:
                await msg.edit(content="⚠️ Nenhum status configurado para este servidor.")

        except Exception as e:
            await msg.edit(content=f"❌ Erro ao atualizar status: {e}")
            log_erro("nStatus", e)

    @commands.command()
    @commands.has_permissions(administrator=True)
    async def setchannel(self, ctx):
        guild_id = str(ctx.guild.id)
        channel_id = str(ctx.channel.id)

        # Corrigido: atualiza servidor_configs em vez de servidor_cargos
        self.supabase.table("servidor_configs").upsert({
            "guild_id": guild_id,
            "canal_avisos_id": channel_id
        }).execute()

        await ctx.send(f"✅ Canal de anúncios definido para {ctx.channel.mention}!")

    @commands.command(name="nPing")
    async def ping(self, ctx):
        latencia = round(self.bot.latency * 1000)
        embed = discord.Embed(
            title="🏓 Pong!",
            description=f"A latência atual é de **{latencia}ms**.",
            color=0x5865f2
        )
        await ctx.send(embed=embed)

    @commands.command(name="nPing2")
    async def ping_real(self, ctx):
        inicio = datetime.now()
        msg = await ctx.send("🏓 Calculando...")
        fim = datetime.now()

        duracao = round((fim - inicio).total_seconds() * 1000)
        await msg.edit(content=f"🏓 **Pong!**\nResposta em: `{duracao}ms` | Gateway: `{round(self.bot.latency * 1000)}ms`")

    @commands.command(name="nFix")
    @commands.has_permissions(administrator=True)
    async def nfix(self, ctx):
        """Corrige os cargos de todos os membros baseado no nível atual"""
        guild = ctx.guild
        gid = str(guild.id)
        msg = await ctx.send("🔄 Corrigindo cargos, aguarde...")
        corrigidos = 0
        sem_cargo = 0

        try:
            res = self.supabase.table("niveis").select("user_id, level").eq("guild_id", gid).execute()

            res_p = self.supabase.table("patentes").select("role_id, level_required").eq("guild_id", gid).execute()
            patentes = sorted(res_p.data, key=lambda x: x['level_required'])
            ids_patentes = {int(p['role_id']) for p in patentes}

            if not patentes:
                return await msg.edit(content="⚠️ Nenhuma patente cadastrada para este servidor.")

            for entry in res.data:
                member = guild.get_member(int(entry['user_id']))
                if not member:
                    continue

                nivel = entry['level']

                cargo_correto = None
                for p in patentes:
                    if p['level_required'] <= nivel:
                        cargo_correto = guild.get_role(int(p['role_id']))

                cargos_remover = [r for r in member.roles if r.id in ids_patentes and r != cargo_correto]
                if cargos_remover:
                    await member.remove_roles(*cargos_remover, reason="nFix: correção de patente")

                if cargo_correto:
                    await member.add_roles(cargo_correto, reason="nFix: correção de patente")
                    corrigidos += 1
                else:
                    sem_cargo += 1

            await msg.edit(content=f"✅ **nFix concluído!**\n📦 Cargos corrigidos: **{corrigidos}**\n⚪ Sem patente ainda: **{sem_cargo}**")

        except discord.Forbidden:
            await msg.edit(content="❌ Sem permissão! O cargo do bot precisa estar **acima** das patentes no servidor.")
        except Exception as e:
            await msg.edit(content=f"❌ Erro no nFix: {e}")
            log_erro("nFix", e)

    @commands.command(name="nAdmin")
    @commands.has_permissions(administrator=True)
    async def nadmin(self, ctx):
        """Painel administrativo do servidor"""
        gid = str(ctx.guild.id)
        msg = await ctx.send("🔄 Carregando painel...")

        try:
            res_cfg = self.supabase.table("servidor_configs")\
                .select("canal_avisos_id, cargo_top1_id, status_texto, tipo_atividade")\
                .eq("guild_id", gid)\
                .execute()

            res_pat = self.supabase.table("patentes")\
                .select("role_id, role_name, level_required")\
                .eq("guild_id", gid)\
                .order("level_required")\
                .execute()

            embed = discord.Embed(title="⚙️ Painel Administrativo", color=0x5865f2)
            embed.set_footer(text=f"Servidor: {ctx.guild.name}")

            if res_cfg.data:
                cfg = res_cfg.data[0]

                canal_id = cfg.get("canal_avisos_id")
                canal = ctx.guild.get_channel(int(canal_id)) if canal_id else None
                embed.add_field(
                    name="📢 Canal de Avisos",
                    value=canal.mention if canal else "❌ Não configurado",
                    inline=True
                )

                top1_id = cfg.get("cargo_top1_id")
                top1 = ctx.guild.get_role(int(top1_id)) if top1_id else None
                embed.add_field(
                    name="👑 Cargo Top 1",
                    value=top1.mention if top1 else "❌ Não configurado",
                    inline=True
                )

                traducoes = {0: "Jogando", 2: "Ouvindo", 3: "Assistindo", 4: "Custom", 5: "Competindo"}
                tipo_id = int(cfg.get("tipo_atividade") or 0)
                status_texto = cfg.get("status_texto") or "Não configurado"
                tipo_nome = traducoes.get(tipo_id, "Desconhecido")
                embed.add_field(
                    name="🎮 Status do Bot",
                    value=f"{tipo_nome}: **{status_texto}**",
                    inline=False
                )
            else:
                embed.add_field(name="⚠️ Configurações", value="Nenhuma configuração encontrada.", inline=False)

            if res_pat.data:
                linhas = []
                for p in res_pat.data:
                    role = ctx.guild.get_role(int(p['role_id']))
                    nome = role.mention if role else p.get('role_name', 'Cargo removido')
                    linhas.append(f"Nível **{p['level_required']}** → {nome}")
                embed.add_field(name="🎖️ Patentes", value="\n".join(linhas), inline=False)
            else:
                embed.add_field(name="🎖️ Patentes", value="❌ Nenhuma patente cadastrada.", inline=False)

            await msg.edit(content=None, embed=embed)

        except Exception as e:
            await msg.edit(content=f"❌ Erro no nAdmin: {e}")
            log_erro("nAdmin", e)



    @commands.command(name="nHistorico")
    async def nhistorico(self, ctx, target: discord.Member = None):
        """Exibe o historico de XP dos ultimos 30 dias em tabela"""
        target = target or ctx.author
        gid = str(ctx.guild.id)
        uid = str(target.id)

        try:
            from datetime import timedelta
            limite = (datetime.utcnow() - timedelta(days=30)).isoformat()

            res = self.supabase.table("xp_historico")\
                .select("xp_total, registrado_em")\
                .eq("guild_id", gid)\
                .eq("user_id", uid)\
                .gte("registrado_em", limite)\
                .order("registrado_em", desc=False)\
                .execute()

            if not res.data:
                return await ctx.send(f"Nenhum historico encontrado para {target.display_name} nos ultimos 30 dias.")

            linhas = []
            for i, row in enumerate(res.data):
                data = row['registrado_em'][:10]
                xp = row['xp_total']
                if i == 0:
                    diff = ""
                else:
                    anterior = res.data[i - 1]['xp_total']
                    delta = xp - anterior
                    diff = f" `(+{delta})`" if delta >= 0 else f" `({delta})`"
                linhas.append(f"`{data}` -- **{xp} XP**{diff}")

            chunks = [linhas[i:i+10] for i in range(0, len(linhas), 10)]

            separador = "\n"
            embed = discord.Embed(
                title=f"Historico de XP -- {target.display_name}",
                description=separador.join(chunks[0]),
                color=0x5865f2
            )
            embed.set_thumbnail(url=target.display_avatar.url)

            for i, chunk in enumerate(chunks[1:], start=2):
                embed.add_field(name=f"Continuacao ({i})", value=separador.join(chunk), inline=False)

            embed.set_footer(text=f"Ultimos 30 dias - {len(res.data)} registros")
            await ctx.send(embed=embed)

        except Exception as e:
            log_erro("nHistorico", e)
            await ctx.send("Erro ao buscar historico.")

    @commands.command(name="nHistorico2")
    async def nhistorico2(self, ctx, target: discord.Member = None):
        """Exibe o historico de XP dos ultimos 30 dias em grafico"""
        target = target or ctx.author
        gid = str(ctx.guild.id)
        uid = str(target.id)

        try:
            import io
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            import matplotlib.dates as mdates
            from datetime import timedelta

            limite = (datetime.utcnow() - timedelta(days=30)).isoformat()

            res = self.supabase.table("xp_historico")\
                .select("xp_total, registrado_em")\
                .eq("guild_id", gid)\
                .eq("user_id", uid)\
                .gte("registrado_em", limite)\
                .order("registrado_em", desc=False)\
                .execute()

            if not res.data:
                return await ctx.send(f"Nenhum historico encontrado para {target.display_name} nos ultimos 30 dias.")

            datas = [datetime.fromisoformat(row['registrado_em'][:10]) for row in res.data]
            xps   = [row['xp_total'] for row in res.data]

            fig, ax = plt.subplots(figsize=(10, 4))
            fig.patch.set_facecolor('#2b2d31')
            ax.set_facecolor('#313338')

            ax.plot(datas, xps, color='#5865f2', linewidth=2.5, marker='o', markersize=4)
            ax.fill_between(datas, xps, alpha=0.15, color='#5865f2')

            ax.xaxis.set_major_formatter(mdates.DateFormatter('%d/%m'))
            ax.xaxis.set_major_locator(mdates.AutoDateLocator())
            plt.xticks(rotation=45, color='#b5bac1', fontsize=8)
            plt.yticks(color='#b5bac1', fontsize=8)

            ax.set_title(f"Historico de XP -- {target.display_name}", color='#f2f3f5', fontsize=13, pad=12)
            ax.set_ylabel("XP", color='#b5bac1', fontsize=9)
            ax.tick_params(colors='#b5bac1')
            for spine in ax.spines.values():
                spine.set_edgecolor('#444')

            ax.grid(True, color='#444', linestyle='--', alpha=0.4)
            plt.tight_layout()

            buf = io.BytesIO()
            plt.savefig(buf, format='png', facecolor=fig.get_facecolor())
            buf.seek(0)
            plt.close()

            file = discord.File(buf, filename="historico_xp.png")
            embed = discord.Embed(title=f"Historico de XP -- {target.display_name}", color=0x5865f2)
            embed.set_image(url="attachment://historico_xp.png")
            embed.set_footer(text=f"Ultimos 30 dias - {len(res.data)} registros")
            await ctx.send(embed=embed, file=file)

        except ImportError:
            await ctx.send("Instale o matplotlib: pip install matplotlib")
        except Exception as e:
            log_erro("nHistorico2", e)
            await ctx.send("Erro ao gerar grafico.")


    @commands.command(name="nReset")
    @commands.has_permissions(administrator=True)
    async def nreset(self, ctx, target: discord.Member = None):
        """Reset de XP. Uso: !nReset (todos) | !nReset @usuario"""
        gid = str(ctx.guild.id)

        if target is None:
            confirm = await ctx.send("⚠️ Isso vai resetar **todos** os níveis do servidor. Digite `CONFIRMAR` em 15 segundos para prosseguir.")
            
            try:
                msg = await self.bot.wait_for(
                    "message",
                    timeout=15,
                    check=lambda m: m.author == ctx.author and m.channel == ctx.channel and m.content == "CONFIRMAR"
                )
                self.supabase.table("niveis").update({
                    "xp": 0, "level": 0, "msg_count": 0, "voice_minutes": 0, "reacoes": 0
                }).eq("guild_id", gid).execute()
                await ctx.send("✅ **Reset completo!** Todos os níveis foram zerados.")
                self.log_acao(gid, str(ctx.author.id), str(ctx.author), "reset_server")

                log_info("nReset", f"Reset total executado por {ctx.author} no servidor {ctx.guild.name}")
            except:
                await ctx.send("❌ Reset cancelado — tempo esgotado.")
                confirm = await ctx.send("⚠️ Isso vai resetar **todos** os níveis do servidor. Digite `CONFIRMAR` em 15 segundos para prosseguir.")
        else:
            uid = str(target.id)
            self.supabase.table("niveis").update({
                "xp": 0, "level": 0, "msg_count": 0, "voice_minutes": 0, "reacoes": 0
            }).eq("guild_id", gid).eq("user_id", uid).execute()
            await ctx.send(f"✅ Nível de **{target.display_name}** resetado!")
            self.log_acao(gid, str(ctx.author.id), str(ctx.author), "reset_user", target_id=uid)
            log_info("nReset", f"Reset de {target} executado por {ctx.author}")

    @commands.command(name="nSetXP")
    @commands.has_permissions(administrator=True)
    async def nsetxp(self, ctx, target: discord.Member = None, valor: int = None):
        """Define o XP de um usuário. Uso: !nSetXP @usuario 500"""
        if target is None or valor is None:
            return await ctx.send("❌ Uso: `!nSetXP @usuario valor`")
        if valor < 0:
            return await ctx.send("❌ O valor de XP não pode ser negativo.")

        gid = str(ctx.guild.id)
        uid = str(target.id)

        res = self.supabase.table("niveis").select("level").eq("guild_id", gid).eq("user_id", uid).execute()
        if not res.data:
            return await ctx.send(f"❌ {target.display_name} não tem registros.")

        self.supabase.table("niveis").update({"xp": valor}).eq("guild_id", gid).eq("user_id", uid).execute()
        self.log_acao(gid, str(ctx.author.id), str(ctx.author), "set_xp", target_id=uid, detalhes={"novo_xp": valor})
        await ctx.send(f"✅ XP de **{target.display_name}** definido para **{valor}**!")
        log_info("nSetXP", f"XP de {target} definido para {valor} por {ctx.author}")

    @commands.command(name="nSetLevel")
    @commands.has_permissions(administrator=True)
    async def nsetlevel(self, ctx, target: discord.Member = None, valor: int = None):
        """Define o nível de um usuário. Uso: !nSetLevel @usuario 5"""
        if target is None or valor is None:
            return await ctx.send("❌ Uso: `!nSetLevel @usuario valor`")
        if valor < 0:
            return await ctx.send("❌ O nível não pode ser negativo.")

        gid = str(ctx.guild.id)
        uid = str(target.id)

        res = self.supabase.table("niveis").select("*").eq("guild_id", gid).eq("user_id", uid).execute()
        if not res.data:
            return await ctx.send(f"❌ {target.display_name} não tem registros.")
        
        self.log_acao(gid, str(ctx.author.id), str(ctx.author), "set_level", target_id=uid, detalhes={"novo_level": valor})
        self.supabase.table("niveis").update({"level": valor, "xp": 0}).eq("guild_id", gid).eq("user_id", uid).execute()
        await ctx.send(f"✅ Nível de **{target.display_name}** definido para **{valor}** (XP zerado)!")
        log_info("nSetLevel", f"Nível de {target} definido para {valor} por {ctx.author}")


    @commands.command(name="nInfo")
    async def ninfo(self, ctx):
        """Exibe informações sobre o bot"""
        try:
            from version import VERSION, BOT_NAME, DESCRIPTION, AUTHOR
        except ImportError:
            VERSION, BOT_NAME, DESCRIPTION, AUTHOR = "?", "NZK", "Bot de níveis e XP", "bruninho_219"

        embed = discord.Embed(
            title=f"🤖 {BOT_NAME}",
            description=DESCRIPTION,
            color=0x5865f2
        )
        embed.add_field(name="📦 Versão", value=f"`{VERSION}`", inline=True)
        embed.add_field(name="⚙️ Prefixo", value="`!n`", inline=True)
        embed.add_field(name="📡 Latência", value=f"`{round(self.bot.latency * 1000)}ms`", inline=True)
        embed.add_field(name="🥷 Desenvolvido por", value=f"`{AUTHOR}`", inline=True)
        embed.add_field(name="📖 Ajuda", value="Use `!nHelp` para ver todos os comandos.", inline=False)
        embed.set_thumbnail(url=self.bot.user.display_avatar.url)
        embed.set_footer(text=f"Solicitado por {ctx.author.display_name}", icon_url=ctx.author.display_avatar.url)
        await ctx.send(embed=embed)

    @commands.command(name="nBonus")
    @commands.has_permissions(administrator=True)
    async def nbonus(self, ctx, tipo: str = None, valor: int = None):
        """Configura o bonus de XP. Uso: !nBonus booster 10 | !nBonus admin 10"""
        gid = str(ctx.guild.id)

        if tipo is None:
            try:
                res = self.supabase.table("servidor_configs")                    .select("bonus_booster, bonus_admin, bonus_stack")                    .eq("guild_id", gid).execute()

                cfg = res.data[0] if res.data else {}
                booster  = cfg.get("bonus_booster", 0) or 0
                admin    = cfg.get("bonus_admin", 0) or 0
                stack    = cfg.get("bonus_stack", True)
                stack_str = "Somar os dois" if stack else "Usar o maior"

                embed = discord.Embed(title="🎯 Configuração de Bônus de XP", color=0x5865f2)
                embed.add_field(name="🚀 Booster", value=f"**{booster}%**", inline=True)
                embed.add_field(name="🔧 Admin", value=f"**{admin}%**", inline=True)
                embed.add_field(name="📊 Quando os dois", value=f"**{stack_str}**", inline=True)
                embed.set_footer(text="Use !nBonus booster 10 | !nBonus admin 10 | !nBonusStack sim/nao")
                await ctx.send(embed=embed)
            except Exception as e:
                log_erro("nBonus", e)
            return

        tipo = tipo.lower()
        if tipo in ("booster", "admin"):
            if valor is None or valor < 0 or valor > 100:
                return await ctx.send("❌ Informe um valor entre 0 e 100. Ex: `!nBonus booster 10`")
            campo = "bonus_booster" if tipo == "booster" else "bonus_admin"
            self.supabase.table("servidor_configs").upsert({
                "guild_id": gid, campo: valor
            }).execute()
            await ctx.send(f"✅ Bônus de **{tipo}** definido para **{valor}%**!")
        else:
            await ctx.send("❌ Tipo inválido. Use `booster` ou `admin`.")

    @commands.command(name="nBonusStack")
    @commands.has_permissions(administrator=True)
    async def nbonus_stack(self, ctx, valor: str = None):
        """Define se os bônus se somam ou usa o maior. Uso: !nBonusStack sim | !nBonusStack nao"""
        gid = str(ctx.guild.id)
        if valor is None or valor.lower() not in ("sim", "nao"):
            return await ctx.send("❌ Use `!nBonusStack sim` (somar) ou `!nBonusStack nao` (usar o maior).")

        stack = valor.lower() == "sim"
        self.supabase.table("servidor_configs").upsert({
            "guild_id": gid, "bonus_stack": stack
        }).execute()
        msg = "somados" if stack else "usa o maior"
        await ctx.send(f"✅ Quando adm + booster: bônus serão **{msg}**!")

async def setup(bot):
    await bot.add_cog(GeneralCommands(bot))