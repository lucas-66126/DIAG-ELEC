@echo off
title DIAG-MAINT
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
pause
