@echo off
title DIAG-MAINT
cd /d "%~dp0server"
where node >nul 2>nul
if %errorlevel%==0 goto node

echo Node.js introuvable : lancement sans serveur IA (moteur local uniquement).
echo Pour l'agent IA, installez Node.js : winget install OpenJS.NodeJS.LTS
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
goto end

:node
if not exist node_modules (
  echo Premiere utilisation : installation des dependances du serveur...
  call npm install --omit=dev
)
if not exist .env (
  echo Astuce : copiez server\.env.example en server\.env et ajoutez votre cle ANTHROPIC_API_KEY pour activer l'IA.
)
rem Le navigateur est ouvert quelques secondes APRES le demarrage du serveur :
rem ouvert trop tot, il affiche l'ancienne version gardee en memoire.
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:8787/"
node src\index.js

:end
pause
