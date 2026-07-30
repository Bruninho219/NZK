from dotenv import load_dotenv
load_dotenv()

import os
import requests

url = os.getenv("DISCORD_WEBHOOK_LOGS")

print("URL carregada do .env:", repr(url))

if not url:
    print("❌ A variável DISCORD_WEBHOOK_LOGS não foi encontrada no .env")
else:
    try:
        resp = requests.post(url, json={"content": "🧪 Teste direto do webhook"}, timeout=5)
        print("Status code:", resp.status_code)
        print("Resposta:", resp.text)
    except Exception as e:
        print("❌ Erro ao enviar:", type(e).__name__, e)