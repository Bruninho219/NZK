import discord
from discord.ext import commands
from logger import log_info, log_erro

class Sync(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.supabase = bot.supabase

    async def _sincronizar(self, guild):
        """Lógica principal de sincronização — reaproveitada tanto pelo
        comando manual !nSync quanto pelo listener automático on_guild_join."""
        gid = str(guild.id)

        cargos_data = []
        canais_data = []
        admins_data = []

        for role in guild.roles:
            if not role.is_default() and not role.managed:
                cargos_data.append({
                    "guild_id": gid,
                    "role_id": str(role.id),
                    "role_name": role.name,
                    "posicao": role.position
                })

        for channel in guild.text_channels:
            canais_data.append({
                "guild_id": gid,
                "channel_id": str(channel.id),
                "channel_name": channel.name,
                "posicao": channel.position
            })

        # 🔐 Lista de administradores do servidor (usada pelo login do dashboard)
        for member in guild.members:
            if member.bot:
                continue
            if member.guild_permissions.administrator:
                admins_data.append({
                    "guild_id": gid,
                    "user_id": str(member.id)
                })

        # 🔥 GARANTE A TABELA RAIZ DE SERVIDORES PRIMEIRO (Evita quebra de Foreign Keys)
        self.supabase.table("servidores").upsert({"guild_id": gid}).execute()

        if cargos_data:
            self.supabase.table("servidor_cargos").delete().eq("guild_id", gid).execute()
            self.supabase.table("servidor_cargos").insert(cargos_data).execute()

        if canais_data:
            self.supabase.table("servidor_canais").delete().eq("guild_id", gid).execute()
            self.supabase.table("servidor_canais").insert(canais_data).execute()

        self.supabase.table("servidor_admins").delete().eq("guild_id", gid).execute()
        if admins_data:
            self.supabase.table("servidor_admins").insert(admins_data).execute()

        return len(cargos_data), len(canais_data), len(admins_data)

    @commands.hybrid_command(name="nsync", description="Sincroniza cargos, canais e admins com o banco")
    @commands.has_permissions(administrator=True)
    async def nSync(self, ctx):
        """Sincroniza a lista mestre de cargos, canais e admins respeitando as tabelas com FK"""
        try:
            n_cargos, n_canais, n_admins = await self._sincronizar(ctx.guild)
            await ctx.send(
                f"✅ **nSync:** {n_cargos} cargos, {n_canais} canais e "
                f"{n_admins} admins atualizados com sucesso no banco!"
            )
        except Exception as e:
            await ctx.send(f"❌ Erro na integridade do nSync: {e}")
            log_erro("nSync", e)

    @commands.Cog.listener()
    async def on_guild_join(self, guild):
        """Roda a sincronização automaticamente assim que o bot entra num
        servidor novo — sem precisar de !nSync manual. Importante pro painel
        web já funcionar de cara (lista de admins, cargos e canais prontos)."""
        try:
            n_cargos, n_canais, n_admins = await self._sincronizar(guild)
            log_info(
                "auto_sync_on_join",
                f"Sincronização automática em {guild.name} ({guild.id}): "
                f"{n_cargos} cargos, {n_canais} canais, {n_admins} admins"
            )
        except Exception as e:
            log_erro("auto_sync_on_join", e)

    @commands.hybrid_command(name="nsync2", description="Atualiza os nomes de exibição das patentes")
    @commands.has_permissions(administrator=True)
    async def nSync2(self, ctx):
        """Atualiza os nomes de exibição na tabela patentes puxando da tabela mestre servidor_cargos"""
        gid = str(ctx.guild.id)
        try:
            res_cargos = self.supabase.table("servidor_cargos").select("role_id, role_name").eq("guild_id", gid).execute()

            if not res_cargos.data:
                return await ctx.send("⚠️ Use `!nSync` primeiro para popular a lista de cargos deste servidor.")

            contador = 0
            for cargo in res_cargos.data:
                update = self.supabase.table("patentes")\
                    .update({"role_name": cargo['role_name']})\
                    .eq("guild_id", gid)\
                    .eq("role_id", cargo['role_id'])\
                    .execute()

                if update.data:
                    contador += 1

            await ctx.send(f"✅ **nSync2:** {contador} patentes visíveis tiveram os seus nomes sincronizados!")
        except Exception as e:
            await ctx.send(f"❌ Erro no nSync2: {e}")
            log_erro("nSync2", e)

    @commands.Cog.listener()
    async def on_member_update(self, before, after):
        """Mantém servidor_admins sincronizado automaticamente quando alguém
        ganha ou perde a permissão de administrador (sem precisar de !nSync)."""
        if after.bot:
            return

        was_admin = before.guild_permissions.administrator
        is_admin = after.guild_permissions.administrator

        if was_admin == is_admin:
            return  # nada mudou em relação a admin, ignora

        gid = str(after.guild.id)
        uid = str(after.id)

        try:
            if is_admin:
                self.supabase.table("servidor_admins").upsert({
                    "guild_id": gid,
                    "user_id": uid
                }).execute()
            else:
                self.supabase.table("servidor_admins").delete()\
                    .eq("guild_id", gid).eq("user_id", uid).execute()
        except Exception as e:
            log_erro("auto_sync_admin", e)

    @commands.Cog.listener()
    async def on_guild_role_update(self, before, after):
        """Mantém servidor_cargos e servidor_admins sincronizados automaticamente:
        - Nome ou posição do cargo mudou → atualiza servidor_cargos
        - Permissão de admin do cargo mudou → recalcula servidor_admins de quem tem esse cargo
        """
        gid = str(after.guild.id)

        # --- Nome/posição do cargo ---
        if before.name != after.name or before.position != after.position:
            try:
                self.supabase.table("servidor_cargos").upsert({
                    "guild_id": gid,
                    "role_id": str(after.id),
                    "role_name": after.name,
                    "posicao": after.position
                }, on_conflict="guild_id,role_id").execute()
            except Exception as e:
                log_erro("auto_sync_cargo", e)

        # --- Permissão de administrador do cargo ---
        if before.permissions.administrator != after.permissions.administrator:
            membros_afetados = [m for m in after.members if not m.bot]

            # Separa em dois grupos e manda cada um numa chamada só (upsert em
            # lote / delete com .in_()), em vez de uma request por membro —
            # evita centenas de chamadas sequenciais em cargos com muita gente.
            vira_admin = [str(m.id) for m in membros_afetados if m.guild_permissions.administrator]
            perde_admin = [str(m.id) for m in membros_afetados if not m.guild_permissions.administrator]

            try:
                if vira_admin:
                    self.supabase.table("servidor_admins").upsert([
                        {"guild_id": gid, "user_id": uid} for uid in vira_admin
                    ]).execute()

                if perde_admin:
                    self.supabase.table("servidor_admins").delete()\
                        .eq("guild_id", gid).in_("user_id", perde_admin).execute()
            except Exception as e:
                log_erro("auto_sync_admin_role", e)

    @commands.Cog.listener()
    async def on_guild_role_create(self, role):
        """Adiciona o cargo novo em servidor_cargos assim que é criado."""
        if role.is_default() or role.managed:
            return
        try:
            self.supabase.table("servidor_cargos").upsert({
                "guild_id": str(role.guild.id),
                "role_id": str(role.id),
                "role_name": role.name,
                "posicao": role.position
            }, on_conflict="guild_id,role_id").execute()
        except Exception as e:
            log_erro("auto_sync_cargo_create", e)

    @commands.Cog.listener()
    async def on_guild_role_delete(self, role):
        """Remove o cargo excluído de servidor_cargos."""
        try:
            self.supabase.table("servidor_cargos").delete()\
                .eq("guild_id", str(role.guild.id)).eq("role_id", str(role.id)).execute()
        except Exception as e:
            log_erro("auto_sync_cargo_delete", e)

    @commands.Cog.listener()
    async def on_guild_channel_create(self, channel):
        """Adiciona o canal novo em servidor_canais assim que é criado
        (só canais de texto, mesmo escopo que o !nSync já cobre)."""
        if not isinstance(channel, discord.TextChannel):
            return
        try:
            self.supabase.table("servidor_canais").upsert({
                "guild_id": str(channel.guild.id),
                "channel_id": str(channel.id),
                "channel_name": channel.name,
                "posicao": channel.position
            }, on_conflict="guild_id,channel_id").execute()
        except Exception as e:
            log_erro("auto_sync_canal_create", e)

    @commands.Cog.listener()
    async def on_guild_channel_update(self, before, after):
        """Mantém servidor_canais sincronizado quando um canal de texto
        muda de nome ou de posição."""
        if not isinstance(after, discord.TextChannel):
            return
        if before.name == after.name and before.position == after.position:
            return
        try:
            self.supabase.table("servidor_canais").upsert({
                "guild_id": str(after.guild.id),
                "channel_id": str(after.id),
                "channel_name": after.name,
                "posicao": after.position
            }, on_conflict="guild_id,channel_id").execute()
        except Exception as e:
            log_erro("auto_sync_canal_update", e)

    @commands.Cog.listener()
    async def on_guild_channel_delete(self, channel):
        """Remove o canal excluído de servidor_canais."""
        if not isinstance(channel, discord.TextChannel):
            return
        try:
            self.supabase.table("servidor_canais").delete()\
                .eq("guild_id", str(channel.guild.id)).eq("channel_id", str(channel.id)).execute()
        except Exception as e:
            log_erro("auto_sync_canal_delete", e)

async def setup(bot):
    await bot.add_cog(Sync(bot))
