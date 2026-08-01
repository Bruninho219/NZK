@echo off
title GitHub

:loop
git add .
git commit -m "."
git push
goto loop