@echo off
REM Nora Video Call - Windows Deployment Script
REM Deploys latest changes to production server and restarts the service

setlocal enabledelayedexpansion

set SERVER=nora.jonathanclark.com
set SSH_KEY=../digital_ocean/id_rsa_digitalocean
set DEPLOY_PATH=/home/deploy/nora

echo.
echo ========================================
echo   Nora Video Call - Deployment
echo ========================================
echo.

REM Check for uncommitted changes
git diff-index --quiet HEAD --
if %errorlevel% neq 0 (
    echo Warning: You have uncommitted changes
    echo.
    git status --short
    echo.
    set /p commit_choice="Do you want to commit these changes? (y/n): "
    if /i "!commit_choice!"=="y" (
        set /p commit_msg="Enter commit message: "
        git add -A
        git commit -m "!commit_msg! - Generated with Claude Code - Co-Authored-By: Claude <noreply@anthropic.com>"
        echo Committed changes
    ) else (
        echo Deployment cancelled - commit your changes first
        exit /b 1
    )
)

echo Pushing to GitHub...
git push
if %errorlevel% neq 0 (
    echo Failed to push to GitHub
    exit /b 1
)
echo Pushed to GitHub successfully

echo.
echo Deploying to %SERVER%...
echo.

ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no root@%SERVER% "cd %DEPLOY_PATH% && git pull && systemctl restart nora-server && sleep 3 && systemctl status nora-server --no-pager | head -15"

echo.
echo ========================================
echo   Deployment Complete!
echo ========================================
echo.
echo Visit: https://%SERVER%
echo.
