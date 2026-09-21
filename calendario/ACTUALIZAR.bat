@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"

echo.
echo   Actualizando el calendario...
echo.

py actualizar.py
if errorlevel 9009 goto sin_py
goto fin

:sin_py
python actualizar.py
if errorlevel 9009 (
  echo.
  echo   No encuentro Python en este equipo.
  echo   Instalalo desde https://www.python.org/downloads/
  echo   y marca la casilla "Add Python to PATH".
)

:fin
echo.
pause
