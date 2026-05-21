const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

function createWindow() {
  const win = new BrowserWindow({
    width: 780, height: 860, minWidth: 600, minHeight: 700,
    backgroundColor: '#0a0a0f',
    title: 'PixelProTech Diagnostic Tool',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 10000 }, (err, stdout) => resolve(err ? '' : stdout.trim()));
  });
}

const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

ipcMain.handle('scan-system', async () => {
  const d = {};

  // --- OS & Basic Info ---
  d.os = os.type() + ' ' + os.release();
  d.hostname = os.hostname();
  d.arch = os.arch();
  const cpus = os.cpus();
  d.cpuModel = cpus[0] ? cpus[0].model.trim() : 'Unknown';
  d.cpuCores = cpus.length;
  const upSecs = os.uptime();
  d.uptime = Math.floor(upSecs / 3600) + 'h ' + Math.floor((upSecs % 3600) / 60) + 'm';

  // --- RAM ---
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  d.ramTotal = Math.round(totalMem / 1024 / 1024 / 1024 * 10) / 10;
  d.ramUsed = Math.round((totalMem - freeMem) / 1024 / 1024 / 1024 * 10) / 10;
  d.ramPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

  // --- DISK ---
  if (isWin) {
    try {
      const raw = await run('wmic logicaldisk where drivetype=3 get size,freespace /format:csv');
      const lines = raw.split('\n').filter(l => l.includes(',') && !/Caption|Node/i.test(l));
      let total = 0, free = 0;
      lines.forEach(l => {
        const p = l.trim().split(',');
        if (p.length >= 3) { const f = parseInt(p[1]), s = parseInt(p[2]); if (!isNaN(f) && !isNaN(s)) { free += f; total += s; } }
      });
      d.diskTotal = Math.round(total / 1073741824);
      d.diskFree = Math.round(free / 1073741824);
      d.diskUsed = d.diskTotal - d.diskFree;
      d.diskPercent = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
    } catch(e) { d.diskTotal = 0; d.diskFree = 0; d.diskPercent = 0; }
  } else {
    try {
      const raw = await run("df -BG / | tail -1 | awk '{print $2, $3, $4}'");
      const parts = raw.replace(/G/g, '').split(/\s+/);
      d.diskTotal = parseInt(parts[0]) || 0;
      d.diskUsed = parseInt(parts[1]) || 0;
      d.diskFree = parseInt(parts[2]) || 0;
      d.diskPercent = d.diskTotal > 0 ? Math.round((d.diskUsed / d.diskTotal) * 100) : 0;
    } catch(e) { d.diskTotal = 0; d.diskFree = 0; d.diskPercent = 0; }
  }

  // --- CPU TEMP ---
  d.cpuTemp = -1;
  if (isWin) {
    try {
      const raw = await run('powershell -Command "(Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace root/wmi).CurrentTemperature"');
      const val = parseInt(raw.split('\n')[0]);
      if (!isNaN(val) && val > 0) d.cpuTemp = Math.round((val / 10) - 273.15);
    } catch(e) {}
  } else {
    // Try sensors first
    try {
      const raw = await run("sensors 2>/dev/null | grep -E 'Core 0|Tdie|temp1' | head -1 | grep -oP '[0-9]+\\.[0-9]+'");
      const val = parseFloat(raw);
      if (!isNaN(val) && val > 0) d.cpuTemp = Math.round(val);
    } catch(e) {}
    // Fallback to thermal zone
    if (d.cpuTemp < 0) {
      try {
        const raw = await run('cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null');
        const val = parseInt(raw);
        if (!isNaN(val) && val > 0) d.cpuTemp = Math.round(val / 1000);
      } catch(e) {}
    }
  }

  // --- PENDING UPDATES ---
  d.pendingUpdates = -1;
  if (isWin) {
    try {
      const raw = await run('powershell -Command "(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher().Search(\'IsInstalled=0\').Updates.Count"');
      const val = parseInt(raw);
      if (!isNaN(val)) d.pendingUpdates = val;
    } catch(e) {}
  } else {
    try {
      // Works on Debian/Ubuntu/Mint
      const raw = await run('apt list --upgradable 2>/dev/null | grep -c upgradable || echo 0');
      const val = parseInt(raw);
      if (!isNaN(val)) d.pendingUpdates = Math.max(0, val - 1); // subtract header line
    } catch(e) {}
  }

  // --- STARTUP PROGRAMS ---
  d.startupCount = -1;
  if (isWin) {
    try {
      const raw = await run('powershell -Command "(Get-CimInstance Win32_StartupCommand).Count"');
      const val = parseInt(raw);
      if (!isNaN(val)) d.startupCount = val;
    } catch(e) {}
  } else {
    try {
      const raw = await run('ls /etc/xdg/autostart/ 2>/dev/null | wc -l');
      const val = parseInt(raw);
      if (!isNaN(val)) d.startupCount = val;
    } catch(e) {}
  }

  // --- ANTIVIRUS ---
  d.antivirus = 'Not detected';
  if (isWin) {
    try {
      const raw = await run('powershell -Command "Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | Select-Object -ExpandProperty displayName"');
      if (raw) d.antivirus = raw.split('\n')[0].trim();
    } catch(e) {}
  } else {
    try {
      const raw = await run('which clamav clamdscan clamscan 2>/dev/null | head -1');
      if (raw) d.antivirus = 'ClamAV';
      else {
        const check = await run('systemctl is-active clamav-daemon 2>/dev/null');
        if (check === 'active') d.antivirus = 'ClamAV (active)';
      }
    } catch(e) {}
  }

  // --- OUTDATED DRIVERS ---
  d.outdatedDrivers = -1;
  if (isWin) {
    try {
      const raw = await run('powershell -Command "(Get-WmiObject Win32_PnPSignedDriver | Where-Object {$_.IsSigned -eq $false}).Count"');
      const val = parseInt(raw);
      if (!isNaN(val)) d.outdatedDrivers = val;
    } catch(e) {}
  } else {
    try {
      // Check for missing firmware
      const raw = await run('dmesg 2>/dev/null | grep -ci "firmware" | head -1');
      const val = parseInt(raw);
      d.outdatedDrivers = isNaN(val) ? 0 : Math.min(val, 5);
    } catch(e) { d.outdatedDrivers = 0; }
  }

  // --- LAST BOOT ---
  d.lastBoot = 'Unknown';
  if (isWin) {
    try {
      const raw = await run('powershell -Command "(gcim Win32_OperatingSystem).LastBootUpTime.ToString(\'dd/MM/yyyy HH:mm\')"');
      if (raw) d.lastBoot = raw.split('\n')[0].trim();
    } catch(e) {}
  } else {
    try {
      const raw = await run("who -b | awk '{print $3, $4}'");
      if (raw) d.lastBoot = raw.trim();
    } catch(e) {}
  }

  d.platform = process.platform;
  return d;
});
