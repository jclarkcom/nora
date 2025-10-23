#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Nora Video Call - Deployment Script
Deploys latest changes to production server and restarts the service
"""

import subprocess
import sys
import os
from pathlib import Path

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except:
        pass  # Python < 3.7

# Configuration
SERVER = "nora.jonathanclark.com"
SSH_KEY = Path("../digital_ocean/id_rsa_digitalocean")
DEPLOY_PATH = "/home/deploy/nora"
SERVICE_NAME = "nora-server"

# Colors
class Colors:
    GREEN = '\033[0;32m'
    BLUE = '\033[0;34m'
    YELLOW = '\033[1;33m'
    RED = '\033[0;31m'
    BOLD = '\033[1m'
    NC = '\033[0m'  # No Color


def run_command(command, shell=False, capture_output=False):
    """Run a shell command and return the result"""
    try:
        if capture_output:
            result = subprocess.run(command, shell=shell, capture_output=True, text=True, check=True)
            return result.stdout.strip()
        else:
            result = subprocess.run(command, shell=shell, check=True)
            return result.returncode == 0
    except subprocess.CalledProcessError as e:
        print(f"{Colors.RED}✗ Command failed: {' '.join(command) if isinstance(command, list) else command}{Colors.NC}")
        if capture_output and e.stderr:
            print(f"{Colors.RED}{e.stderr}{Colors.NC}")
        return False


def check_git_status():
    """Check if there are uncommitted changes"""
    result = subprocess.run(
        ["git", "diff-index", "--quiet", "HEAD", "--"],
        capture_output=True
    )
    return result.returncode == 0  # 0 means no changes


def main():
    print()
    print(f"{Colors.BLUE}========================================{Colors.NC}")
    print(f"{Colors.BLUE}  Nora Video Call - Deployment{Colors.NC}")
    print(f"{Colors.BLUE}========================================{Colors.NC}")
    print()

    # Check for uncommitted changes
    if not check_git_status():
        print(f"{Colors.YELLOW}Warning: You have uncommitted changes{Colors.NC}")
        print()
        subprocess.run(["git", "status", "--short"])
        print()

        response = input("Do you want to commit these changes? (y/n): ").lower()
        if response == 'y':
            commit_msg = input("Enter commit message: ")

            # Add all changes
            if not run_command(["git", "add", "-A"]):
                sys.exit(1)

            # Commit with message
            full_commit_msg = f"""{commit_msg}

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"""

            if not run_command(["git", "commit", "-m", full_commit_msg]):
                sys.exit(1)

            print(f"{Colors.GREEN}✓ Changes committed{Colors.NC}")
        else:
            print(f"{Colors.RED}✗ Deployment cancelled - commit your changes first{Colors.NC}")
            sys.exit(1)

    # Push to GitHub
    print(f"{Colors.BLUE}Pushing to GitHub...{Colors.NC}")
    if run_command(["git", "push"]):
        print(f"{Colors.GREEN}[OK] Pushed to GitHub{Colors.NC}")
    else:
        print(f"{Colors.RED}[ERROR] Failed to push to GitHub{Colors.NC}")
        sys.exit(1)

    # Deploy to server
    print()
    print(f"{Colors.BLUE}Deploying to {SERVER}...{Colors.NC}")
    print()

    ssh_command = f"""
        set -e
        echo "Pulling latest code..."
        cd {DEPLOY_PATH}
        git pull

        echo ""
        echo "Restarting server..."
        systemctl restart {SERVICE_NAME}

        echo ""
        echo "Waiting for server to start..."
        sleep 3

        echo ""
        echo "Server status:"
        systemctl status {SERVICE_NAME} --no-pager | head -15
    """

    ssh_cmd = [
        "ssh",
        "-i", str(SSH_KEY),
        "-o", "StrictHostKeyChecking=no",
        f"root@{SERVER}",
        ssh_command
    ]

    if not run_command(ssh_cmd):
        print(f"{Colors.RED}[ERROR] Deployment failed{Colors.NC}")
        sys.exit(1)

    # Success!
    print()
    print(f"{Colors.GREEN}========================================{Colors.NC}")
    print(f"{Colors.GREEN}  Deployment Complete!{Colors.NC}")
    print(f"{Colors.GREEN}========================================{Colors.NC}")
    print()
    print(f"Visit: {Colors.BLUE}https://{SERVER}{Colors.NC}")
    print()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
        print(f"{Colors.YELLOW}Deployment cancelled by user{Colors.NC}")
        sys.exit(1)
    except Exception as e:
        print()
        print(f"{Colors.RED}Error: {e}{Colors.NC}")
        sys.exit(1)
