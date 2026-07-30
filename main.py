import os
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

class MoraxBot(commands.Bot):
    def __init__(self):
        super().__init__(command_prefix=config.PREFIX, intents=intents)
        self.supabase = supabase_client

    async def setup_hook(self):
        self.atualizar_status_db.start()
        
        modulos = ['cogs.leveling', 'cogs.commands', 'cogs.sync']
        for modulo in modulos:
            try:
                await self.load_extension(modulo)
                log_info("setup_hook", f"📦 Módulo {modulo} carregado!")
            except Exception as e:
                log_erro("setup_hook", e)

    @tasks.loop(minutes=1440)
    async def atualizar_status_db(self):
        try:
            if not self.guilds: 
                return
            
            guild_id = "602623690206609418"  # Nazarick

            res = self.supabase.table("servidor_configs") \
                .select("status_texto, tipo_atividade") \
                .eq("guild_id", guild_id) \
                .execute()
            
            if res.data and res.data[0].get('status_texto'):
                cfg = res.data[0]
                texto = cfg['status_texto']
                tipo_id = cfg.get('tipo_atividade') if cfg.get('tipo_atividade') is not None else 0
                
                tipo_formatado = discord.ActivityType(int(tipo_id))
                
                await self.change_presence(
                    activity=discord.Activity(type=tipo_formatado, name=texto)
                )
                log_info("atualizar_status_db", f"Status atualizado: {tipo_formatado.name} -> {texto}")
            else:
                await self.change_presence(
                    activity=discord.Activity(type=config.BOT_STATUS_TYPE, name=config.BOT_STATUS_TEXT)
                )
                log_aviso("atualizar_status_db", "Nenhum status encontrado no banco, usando config padrão")
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

token = os.getenv("TOKEN_DISCORD")
if token:
    bot.run(token)
else:
    log_erro("main", Exception("TOKEN_DISCORD não encontrado no .env"))