@echo off
title Executador NZK Bot - Reinicio Automatico

:loop
echo [%time%] Iniciando o NZK Bot...
python main.py
echo [%time%] ⚠️ O bot foi finalizado ou interrompido. Reiniciando em 3 segundos...
timeout /t 3 /nobreak >nul
goto loop