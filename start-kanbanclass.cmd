@echo off
rem Starts KanbanClass and opens it in the browser. Close this window to stop the app.
setlocal
cd /d "%~dp0"
title KanbanClass

if not exist "node_modules\" (
  echo Installing dependencies. This happens once and takes a few minutes...
  call npm install || goto :fail
)

if not exist "prisma\dev.db" (
  echo Preparing the database...
  call npx prisma db push --skip-generate || goto :fail
)

echo Building the app...
call npm run build || goto :fail

echo.
echo KanbanClass is starting at http://localhost:3001
echo Keep this window open while you use the app. Close it to stop.
echo.
start "" "http://localhost:3001"
call npm run start
goto :eof

:fail
echo.
echo Something went wrong. The message above says what.
pause
