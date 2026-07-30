import logging
import os
from datetime import datetime

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

def log_info(origem: str, mensagem: str):
    logger.info(f"[{origem}] {mensagem}")

def log_erro(origem: str, erro: Exception):
    logger.error(f"[{origem}] {type(erro).__name__}: {erro}")

def log_aviso(origem: str, mensagem: str):
    logger.warning(f"[{origem}] {mensagem}")