# PixelProTech Diagnostic Tool
Real-time PC diagnostic — reads actual hardware on Windows AND Linux.

## Setup (one time)
1. Install Node.js from https://nodejs.org (LTS)
2. Open terminal in this folder
3. npm install

## Run
npm start

## Build
Windows .exe:       npm run build:win
Linux AppImage:     npm run build:linux
Both at once:       npm run build:all

Output goes to /dist folder.

## What it reads
RAM, Disk, CPU Temp, Pending Updates, Startup Programs,
Antivirus, Drivers, OS Info, Hostname, Uptime, Last Boot

## Linux notes
- CPU temp: uses `sensors` (install: sudo apt install lm-sensors)
- Updates: works on Ubuntu/Mint/Debian (apt)
- Antivirus: detects ClamAV
- Run: sudo npm start for full driver results

## Windows notes
- Uses wmic + PowerShell — no extra installs needed
- Run as Administrator for full results
- CPU temp may show N/A on some machines
