#!/usr/bin/env python3
import os
import time
import sys
import requests
import paramiko
from pathlib import Path

# Load DigitalOcean API token
sys.path.insert(0, '../digital_ocean')
import dotenv
dotenv.load_dotenv('../digital_ocean/.env')

DO_TOKEN = os.getenv('DO_API_TOKEN')
if not DO_TOKEN:
    raise ValueError("Missing DO_API_TOKEN in ../digital_ocean/.env file")

# Constants
SSH_KEY_PATH = Path('../digital_ocean/id_rsa_digitalocean')
SSH_PUB_KEY_PATH = Path('../digital_ocean/id_rsa_digitalocean.pub')
DROPLET_NAME = "nora-video-call"
REGION = "nyc1"
SIZE = "s-1vcpu-512mb-10gb"  # Smallest/cheapest DO droplet ($4/month)
IMAGE = "ubuntu-22-04-x64"
DOMAIN = "nora.jonathanclark.com"
GITHUB_REPO = "https://github.com/jclarkcom/nora.git"
EMAIL = "jonathan@jonathanclark.com"  # For Let's Encrypt

HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {DO_TOKEN}"
}
BASE_URL = "https://api.digitalocean.com/v2"

# Get local IP for SSH whitelist
try:
    LOCAL_IP = requests.get('https://api.ipify.org').text.strip()
    print(f"Your public IP address: {LOCAL_IP}")
except:
    LOCAL_IP = input("Enter your public IP address for SSH whitelist: ")
    if not LOCAL_IP:
        raise ValueError("IP address is required for security")

def upload_ssh_key():
    """Upload SSH public key to DigitalOcean"""
    print("Uploading SSH key to DigitalOcean...")
    with open(SSH_PUB_KEY_PATH, 'r') as f:
        ssh_pub_key = f.read().strip()
    
    # Check if key already exists
    response = requests.get(f"{BASE_URL}/account/keys", headers=HEADERS)
    
    if response.status_code == 200:
        keys = response.json().get('ssh_keys', [])
        for key in keys:
            if 'nora-deploy-key' in key.get('name', ''):
                print(f"Found existing SSH key with ID: {key['id']}")
                return key['id']
    
    # Key doesn't exist, create it
    key_name = f"nora-deploy-key-{int(time.time())}"
    print(f"Creating new SSH key with name: {key_name}")
    
    response = requests.post(
        f"{BASE_URL}/account/keys",
        headers=HEADERS,
        json={
            "name": key_name,
            "public_key": ssh_pub_key
        }
    )
    
    if response.status_code == 201:
        ssh_key_id = response.json()['ssh_key']['id']
        print(f"SSH key uploaded successfully with ID: {ssh_key_id}")
        return ssh_key_id
    else:
        raise Exception(f"Failed to upload SSH key: {response.text}")

def create_droplet(ssh_key_id):
    """Create DigitalOcean droplet"""
    print(f"Creating droplet: {DROPLET_NAME}")
    
    user_data = """#!/bin/bash
# Update system
apt-get update
apt-get upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install nginx
apt-get install -y nginx

# Install certbot
apt-get install -y certbot python3-certbot-nginx

# Install git
apt-get install -y git

# Create deploy user
useradd -m -s /bin/bash deploy
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh

# Add deploy user to sudoers (for certbot and nginx)
echo "deploy ALL=(ALL) NOPASSWD: /usr/bin/certbot, /usr/bin/systemctl" >> /etc/sudoers.d/deploy

# Set up firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
"""
    
    response = requests.post(
        f"{BASE_URL}/droplets",
        headers=HEADERS,
        json={
            "name": DROPLET_NAME,
            "region": REGION,
            "size": SIZE,
            "image": IMAGE,
            "ssh_keys": [ssh_key_id],
            "user_data": user_data,
            "backups": False,
            "ipv6": True,
            "monitoring": True
        }
    )
    
    if response.status_code == 202:
        droplet_id = response.json()['droplet']['id']
        print(f"Droplet created with ID: {droplet_id}")
        return droplet_id
    else:
        raise Exception(f"Failed to create droplet: {response.text}")

def wait_for_droplet(droplet_id):
    """Wait for droplet to be active"""
    print("Waiting for droplet to become active...")
    
    while True:
        response = requests.get(
            f"{BASE_URL}/droplets/{droplet_id}",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            droplet = response.json()['droplet']
            status = droplet['status']
            
            if status == 'active':
                ip_address = droplet['networks']['v4'][0]['ip_address']
                print(f"Droplet is active at IP: {ip_address}")
                return ip_address
            else:
                print(f"Droplet status: {status}, waiting...")
                time.sleep(5)
        else:
            raise Exception(f"Failed to get droplet status: {response.text}")

def main():
    print("=" * 60)
    print("Nora Video Call App - DigitalOcean Deployment")
    print("=" * 60)
    print()
    print("This script will:")
    print("1. Create a DigitalOcean droplet")
    print("2. Install Node.js, nginx, certbot")
    print("3. Clone the Nora repository")
    print("4. Set up systemd services")
    print("5. Configure nginx reverse proxy")
    print()
    print(f"Domain: {DOMAIN}")
    print(f"Droplet: {DROPLET_NAME}")
    print(f"Region: {REGION}")
    print(f"Size: {SIZE}")
    print()
    
    input("Press Enter to continue or Ctrl+C to cancel...")
    
    # Upload SSH key
    ssh_key_id = upload_ssh_key()
    
    # Create droplet
    droplet_id = create_droplet(ssh_key_id)
    
    # Wait for droplet to be ready
    ip_address = wait_for_droplet(droplet_id)
    
    print("
" + "=" * 60)
    print("Droplet Created Successfully!")
    print("=" * 60)
    print(f"IP Address: {ip_address}")
    print(f"Domain: {DOMAIN}")
    print()
    print("NEXT STEPS:")
    print("=" * 60)
    print("1. Point DNS A record for {} to {}".format(DOMAIN, ip_address))
    print("2. Wait 5-10 minutes for the server to finish installing packages")
    print("3. SSH into the server: ssh root@{}".format(ip_address))
    print("4. Run the setup commands (see DEPLOYMENT.md)")
    print("=" * 60)

if __name__ == "__main__":
    main()
