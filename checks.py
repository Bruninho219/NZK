import os
from discord.ext import commands

_owner_id_raw = os.getenv("OWNER_ID")
OWNER_ID = int(_owner_id_raw) if _owner_id_raw else None


def is_admin_or_owner():
    """Libera o comando se o autor for administrador OU o dono definido em OWNER_ID (.env)."""
    async def predicate(ctx):
        if OWNER_ID is not None and ctx.author.id == OWNER_ID:
            return True
        return ctx.author.guild_permissions.administrator
    return commands.check(predicate)