@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"

echo.
echo   Buscando letras y caratulas en internet...
echo.

py completar.py %*
if errorlevel 9009 goto sin_py
goto fin

:sin_py
python completar.py %*
if errorlevel 9009 (
  echo.
  echo   No encuentro Python en este equipo.
  echo   Instalalo desde https://www.python.org/downloads/
  echo   y marca la casilla "Add Python to PATH".
)

:fin
echo.
pause
