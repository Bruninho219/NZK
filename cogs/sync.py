import discord
from discord.ext import commands
from logger import log_erro

class Sync(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.supabase = bot.supabase

    @commands.command(name="nSync")
    @commands.has_permissions(administrator=True)
    async def nSync(self, ctx):
        """Sincroniza a lista mestre de cargos, canais e admins respeitando as tabelas com FK"""
        guild = ctx.guild
        gid = str(guild.id)

        cargos_data = []
        canais_data = []
        admins_data = []

        for role in guild.roles:
            if not role.is_default() and not role.managed:
                cargos_data.append({
                    "guild_id": gid,
                    "role_id": str(role.id),
                    "role_name": role.name
                })

        for channel in guild.text_channels:
            canais_data.append({
                "guild_id": gid,
                "channel_id": str(channel.id),
                "channel_name": channel.name
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

        try:
            # 🔥 GARANTE A TABELA RAIZ DE SERVIDORES PRIMEIRO (Evita quebra de Foreign Keys)
            self.supabase.table("servidores").upsert({"guild_id": gid}).execute()

            if cargos_data:
                self.supabase.table("servidor_cargos").delete().eq("guild_id", gid).execute()
                self.supabase.table("servidor_cargos").insert(cargos_data).execute()

            if canais_data:
                self.supabase.table("servidor_canais").delete().eq("guild_id", gid).execute()
                self.supabase.table("servidor_canais").insert(canais_data).execute()

            # Sempre roda, mesmo que a lista fique vazia (ex: todo mundo perdeu admin)
            self.supabase.table("servidor_admins").delete().eq("guild_id", gid).execute()
            if admins_data:
                self.supabase.table("servidor_admins").insert(admins_data).execute()

            await ctx.send(
                f"✅ **nSync:** {len(cargos_data)} cargos, {len(canais_data)} canais e "
                f"{len(admins_data)} admins atualizados com sucesso no banco!"
            )
        except Exception as e:
            await ctx.send(f"❌ Erro na integridade do nSync: {e}")
            log_erro("nSync", e)

    @commands.command(name="nSync2")
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

async def setup(bot):
    await bot.add_cog(Sync(bot))
