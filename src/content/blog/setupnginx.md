---
draft: false 
date: "31-10-2026"
title: "How to set up nginx and certbot"
description: "How to set up nginx and certbot"
category: "devlog"
tags: ["nginx", "server", "command", "guide"]
author: "Yanouk"
---
# Setting up Nginx and certbot

7/26/2026

- [Introduction](#introduction)
- [Guide Specific Requirements](#guide-specific-requirements)
- [Installing Nginx](#Installing-Nginx)
- [Installing certbot](#Installing-certbot)
- [Configure jellyfin networking settings](#configure-jellyfin-networking-settings)
- [Troubleshooting](#troubleshooting)

## Introduction

This guide sets up Jellyfin Web UI with Chromecast. Chromecast needs HTTPS with a valid certificate, which means:

- Getting a signed HTTPS certificate for a public domain name.
- Making that certificate work on a local network.
- Writing a Content-Security-Policy that lets browsers load cross-origin Chromecast scripts.
- Configuring nginx as a reverse proxy for Jellyfin.

### Requirements

- A valid public domain name and access to its DNS records.
- A working & configured Jellyfin server.
- Debian based distribution.

### Guide Specific Requirements

This guide uses a specific setup that may not match yours.

- I set up an `nginx` reverse proxy on Debian that points to your existing Jellyfin server.
- I install `certbot` and a certbot DNS plugin from PyPI.
- This is an overview I wrote so I can turn it into an Ansible role later. It skips some steps and assumes you know Linux, Python virtualenvs, and nginx.

## Installing Nginx

Add the following config inside `/etc/nginx/sites-available` as a file named jellyfin. You should also symlink this file to `/etc/nginx/sites-enabled/`

```

server {
  listen 80;
  listen [::]:80;
  server_name jellyfin.yourserver.com;

  # Uncomment to redirect HTTP to HTTPS
  return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;

    server_name jellyfin.yourserver.com;

    ## The default `client_max_body_size` is 1M, this might not be enough for some posters, etc.
    client_max_body_size 20M;

    ssl_certificate /etc/letsencrypt/live/jellyfin.yourserver.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jellyfin.yourserver.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;
    ssl_trusted_certificate /etc/letsencrypt/live/jellyfin.yourserver.com/chain.pem;
    ssl_stapling on;
    ssl_stapling_verify on;

    # Security / XSS Mitigation Headers
    # NOTE: X-Frame-Options may cause issues with the webOS app
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";

    # Content Security Policy
    # See: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
    # Enforces https content and restricts JS/CSS to origin
    # External Javascript (such as cast_sender.js for Chromecast) must be whitelisted.
    # NOTE: The default CSP headers may cause issues with the webOS app
    # NOTE 2:  cast_sender.js links may need to be updated.  Check jellyfin console for load errors
    add_header Content-Security-Policy "default-src https: data: blob: http://image.tmdb.org; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://www.gstatic.com/cv/js/sender/v1/cast_sender.js https://www.gstatic.com/eureka/clank/108/cast_sender.js https://www.gstatic.com/eureka/clank/107/cast_sender.js https://www.gstatic.com/eureka/clank/cast_sender.js https://www.youtube.com blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'self'";

    location = / {
        return 302 http://$host/web/;
        #return 302 https://$host/web/;
    }

    location / {
        # Proxy main Jellyfin traffic
        proxy_pass http://10.10.10.123:8096;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Protocol $scheme;
        proxy_set_header X-Forwarded-Host $http_host;

        # Disable buffering when the nginx proxy gets very resource heavy upon streaming
        proxy_buffering off;
    }

    # location block for /web - This is purely for aesthetics so /web/#!/ works instead of having to go to /web/index.html/#!/
    location = /web/ {
        # Proxy main Jellyfin traffic
        proxy_pass http://10.10.10.123:8096/web/index.html;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Protocol $scheme;
        proxy_set_header X-Forwarded-Host $http_host;
    }

    location /socket {
        # Proxy Jellyfin Websockets traffic
        proxy_pass http://10.10.10.123:8096;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Protocol $scheme;
        proxy_set_header X-Forwarded-Host $http_host;
    }
}
```

Replace `jellyfin.yourserver.com` and `10.10.10.123` with the DNS/IP for your actual server.

## Ensure Content-Security-Policy is correct

Start up your Chrome browser and ensure the dev tools are open. ( right click -> inspect )

In the `Network` tab ensure `Disable Cache` is enabled.

Switch to the `Console` tab and then enter in `jellyfin.yourserver.com`

This should automatically load `https` and display a secure connection (lock icon next to the address bar)

Once logged into your jellyfin dashboard, ensure the console log does not display any errors that look like:

```
Refused to load the script 'https://www.gstatic.com/eureka/clank/108/cast_sender.js' because it violates the following Content Security Policy directive...
```

If you do, you need to add the URL in the error to the `add_header Content-Security-Policy` line in your `nginx.conf`.

As mentioned before, this will work without `add_header Content-Security-Policy`, but do you trust the code running on your local server that much?

## Installing `certbot`

- Follow instructions here: https://certbot.eff.org/instructions?ws=nginx&os=pip
- I use the latest certbot from `pip` instead of the version in Debian's repositories or the snap store. That lets me install certbot DNS plugins from PyPI. The certbot docs list them: https://eff-certbot.readthedocs.io/en/stable/using.html#dns-plugins
- I use `certbot-dns-multi` to update DNS records at my provider. See https://github.com/alexzorin/certbot-dns-multi#usage for setup. Other plugins target specific providers, but this one gets the most updates and supports the most providers.

### Configuring `certbot`

- Register your letsencrypt account via the instructions in the `certbot` documentation.

```
certbot certonly -a dns-multi --dns-multi-credentials=/etc/letsencrypt/dns-multi.ini -d "jellyfin.yourserver.com" --dry-run`
```

- Replace `jellyfin.yourserver.com` with your domain.

Once you've successfully run the dry run without errors, remove it and re-run the command.

```
certbot certonly -a dns-multi --dns-multi-credentials=/etc/letsencrypt/dns-multi.ini -d "jellyfin.yourserver.com"
```

If successful, `certbot` will place the created SSL certificates into `/etc/letsencrypt`.

## Automatically run certbot

```
(crontab -l 2>/dev/null; echo "0 0,12 * * * /opt/certbot/bin/certbot renew -q") | crontab -
```

I installed certbot under a `certbot` user and gave that user ownership of the directories it needs. That lets a non-root user run certbot. nginx starts as root and drops privileges afterwards, so it can still read the generated certificates.

- **Note**: If you use a non-root user, you'll have to configure that user to be allowed to run service restarts. See any tutorial on how to add your own custom config to `/etc/sudoers.d/`.

## Configure Jellyfin networking settings

Access the Networking settings by going to Dashboard - > Networking

Set `LAN Networks` to your local area network range with slash notation. Example: `192.168.0.0/24`

Set `Known Proxies` to your NGINX Proxy server name, `jellyfin.yourserver.com`

**Do not change any HTTPS settings, it is not necessary with the nginx proxy**

## Troubleshooting

### `jellyfin.yourserver.com` isn't loading

Ensure Jellyfin is running.

Ensure Nginx is running

Ensure that your DNS records are set at your DNS provider.

Ensure `jellyfin`'s networking HTTPS settings are disabled

---

### `Google Cast` isn't showing up in the cast list

Ensure you're running the site in Google Chrome or Chromium browsers

Ensure there are no errors loading `cast_sender.js` in the browser console logs

Ensure your Chromecast is plugged in and powered on.

---

### `jellyfin` acts like it is playing, but the screen is black

Check your supported bitrate. For example, my first generation Chromecast only supports bitrates up to 8 Mbps.

You can set the bitrate in user -> settings -> playback -> `Google Cast Streaming Quality`. Note: This seems to only change bitrate, not resolution as implied by the dropdown menu.
