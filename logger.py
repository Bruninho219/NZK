import logging
import os
import threading
from datetime import datetime
from dotenv import load_dotenv

# Garante que o .env já esteja carregado neste ponto, independente da
# ordem de imports do arquivo que chama este módulo (ex: main.py importa
# logger.py antes de chamar load_dotenv() — sem isso aqui, WEBHOOK_LOGS
# ficaria sempre vazio). load_dotenv() é seguro de chamar mais de uma vez.
load_dotenv()

# Cria a pasta de logs se não existir
os.makedirs("logs", exist_ok=True)

# Nome do arquivo com a data de hoje
log_filename = f"logs/bot_{datetime.now().strftime('%Y-%m-%d')}.log"

# Configura o logger principal
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.FileHandler(log_filename, encoding="utf-8"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("NZKBot")

# Silencia logs internos — organizados juntos
logging.getLogger("discord").propagate = False
logging.getLogger("httpx").propagate = False

# 🔔 Webhook do Discord pra alertas de erro em tempo real (opcional).
# Se a variável de ambiente não estiver definida, os alertas são
# simplesmente ignorados — o bot continua funcionando normal.
WEBHOOK_LOGS = os.getenv("DISCORD_WEBHOOK_LOGS")


def _enviar_webhook(mensagem: str):
    """Envia o alerta em background, sem travar o loop do bot.
    Qualquer falha aqui é silenciosa de propósito — um alerta que falha
    não pode derrubar o bot nem gerar erro em cascata."""
    if not WEBHOOK_LOGS:
        return
    try:
        import requests
        requests.post(WEBHOOK_LOGS, json={"content": mensagem[:1900]}, timeout=5)
    except Exception:
        pass


def log_info(origem: str, mensagem: str):
    logger.info(f"[{origem}] {mensagem}")


def log_erro(origem: str, erro: Exception):
    msg = f"[{origem}] {type(erro).__name__}: {erro}"
    logger.error(msg)
    threading.Thread(
        target=_enviar_webhook,
        args=(f"🔴 **Erro no NZK Bot**\n`{msg}`",),
        daemon=True
    ).start()


def log_aviso(origem: str, mensagem: str):
    logger.warning(f"[{origem}] {mensagem}")
