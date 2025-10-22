# Nora - Deployment Guide

This guide explains how to deploy the Nora video call application to DigitalOcean.

## Prerequisites

1. DigitalOcean account with API token (stored in `../digital_ocean/.env`)
2. Domain `nora.jonathanclark.com` that you can configure DNS for
3. Python 3 with required packages: `paramiko`, `requests`, `python-dotenv`

## Quick Deploy

### Step 1: Run the deployment script

```bash
python3 deploy_nora.py
```

This will:
- Create a DigitalOcean droplet ($4/month - 512MB RAM)
- Install Node.js 20, nginx, certbot, and git
- Create a `deploy` user for running the application

### Step 2: Configure DNS

Point an A record for `nora.jonathanclark.com` to the IP address shown by the script.

Wait 5-10 minutes for:
- DNS propagation
- The droplet to finish installing packages

### Step 3: SSH into the server and complete setup

```bash
# SSH into the server (IP shown by deployment script)
ssh root@YOUR_DROPLET_IP

# Clone the repository
cd /home/deploy
sudo -u deploy git clone https://github.com/jclarkcom/nora.git
cd nora

# Install dependencies
cd server && sudo -u deploy npm install && cd ..
cd web-tablet && sudo -u deploy npm install && cd ..

# Create environment file (if needed for email, etc.)
sudo -u deploy nano server/.env

# Create systemd service for the server
sudo tee /etc/systemd/system/nora-server.service > /dev/null <<'SERVICE'
[Unit]
Description=Nora Video Call Server
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/nora/server
Environment=NODE_ENV=production
Environment=PORT=4000
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

# Create systemd service for the web-tablet
sudo tee /etc/systemd/system/nora-web.service > /dev/null <<'SERVICE'
[Unit]
Description=Nora Web Tablet Server
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/nora/web-tablet
Environment=NODE_ENV=production
Environment=PORT=4001
ExecStart=/usr/bin/npx http-server -p 4001
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

# Configure nginx
sudo tee /etc/nginx/sites-available/nora.jonathanclark.com > /dev/null <<'NGINX'
server {
    listen 80;
    server_name nora.jonathanclark.com;

    # API server
    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 10M;
    }

    # Socket.IO
    location /socket.io {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Admin panel
    location /admin {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Uploads
    location /uploads {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # Web tablet interface
    location / {
        proxy_pass http://localhost:4001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

# Enable the nginx site
sudo ln -sf /etc/nginx/sites-available/nora.jonathanclark.com /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Start services
sudo systemctl enable nora-server nora-web
sudo systemctl start nora-server nora-web
sudo systemctl reload nginx

# Check service status
sudo systemctl status nora-server
sudo systemctl status nora-web
```

### Step 4: Set up SSL with certbot

```bash
# Make sure DNS is pointing to the server first!
# Then run:
sudo certbot --nginx -d nora.jonathanclark.com --email jonathan@jonathanclark.com --agree-tos --no-eff-email
```

## Updating the Application

To deploy updates via git:

```bash
# SSH into the server
ssh root@YOUR_DROPLET_IP

# Pull latest code
cd /home/deploy/nora
sudo -u deploy git pull

# Install any new dependencies
cd server && sudo -u deploy npm install && cd ..
cd web-tablet && sudo -u deploy npm install && cd ..

# Restart services
sudo systemctl restart nora-server nora-web
```

## Monitoring

```bash
# Check logs
sudo journalctl -u nora-server -f
sudo journalctl -u nora-web -f

# Check nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## Troubleshooting

### Services won't start
```bash
# Check what's wrong
sudo systemctl status nora-server
sudo journalctl -u nora-server -n 50

# Make sure ports aren't already in use
sudo netstat -tlnp | grep :4000
sudo netstat -tlnp | grep :4001
```

### SSL certificate fails
```bash
# Make sure DNS is pointing to the server
dig nora.jonathanclark.com

# Check nginx is running
sudo systemctl status nginx

# Try certbot again with verbose output
sudo certbot --nginx -d nora.jonathanclark.com --email jonathan@jonathanclark.com --agree-tos --no-eff-email -v
```

### Memory issues (512MB is tight!)
```bash
# Check memory usage
free -h

# Add swap if needed
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## Cost

- DigitalOcean Droplet: $4/month (512MB RAM, 10GB disk, 1 CPU)
- Total: $4/month

## Security Notes

- The server uses UFW firewall (ports 22, 80, 443 open)
- SSL/TLS encryption via Let's Encrypt
- Admin panel should be IP-restricted (configured in server/app.js)
- Consider adding fail2ban for SSH protection
