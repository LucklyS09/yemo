@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Ink Nocturne

set "NODE_EXE="
where node >nul 2>nul
if not errorlevel 1 set "NODE_EXE=node"

if defined NODE_EXE (
  "%NODE_EXE%" --version >nul 2>nul
  if errorlevel 1 set "NODE_EXE="
)

if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

if not defined NODE_EXE (
  echo.
  echo   Node.js was not found.
  echo   Install Node.js 18 or newer from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not defined INK_OPEN set "INK_OPEN=1"
"%NODE_EXE%" server.js

if errorlevel 1 (
  echo.
  echo   Ink Nocturne could not start.
  echo   Copy the error above when asking for help.
  echo.
  pause
)
