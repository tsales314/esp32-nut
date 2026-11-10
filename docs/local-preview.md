# Interactive local UI preview

This preview serves the real frontend source in `data/www` and returns
simulated UPS and configuration responses from a small Node.js HTTP server.
It never connects to an ESP32, changes hardware settings, flashes firmware,
or changes the `main` Git branch. Data is stored only in memory.

## Start on your Mac

In Terminal, from an existing checkout of your fork:

```sh
git fetch origin
git switch feature/dashboard-redesign
git pull --ff-only origin feature/dashboard-redesign
npm run preview
```

If the repository has not yet been cloned:

```sh
git clone https://github.com/tsales314/esp32-nut.git
cd esp32-nut
git switch feature/dashboard-redesign
npm run preview
```

Open **http://127.0.0.1:3000** in Chrome or Safari. The server binds only
to the local loopback address (not your home network). If port 3000 is busy,
use `PORT=3001 npm run preview` and visit http://127.0.0.1:3001.

To stop, press **Ctrl+C** in the terminal.

## What you can try

- Open the hamburger menu and navigate between Dashboard, Commands,
  UPS Settings, Network, NUT Server, Board Settings, System Logs and Firmware OTA.
  Firmware OTA keeps the hamburger menu visible and uses an embedded version
  of the normal upload page. The mock server rejects actual firmware uploads.
- Review the always-visible UPS Status banner, followed by four larger quick
  readings (**UPS Load**, **Battery Charge**, **Output Power**, **Runtime**) and
  compact, collapsible **Output**, **Input** and **Device Details** sections.
  Output and Input sit side by side in wide desktop windows; they stack on
  smaller windows, with the quick readings in a 2 × 2 grid on phones.
  Click any reading to see its raw NUT variable and description. Colored dots
  signal live readings and explicit warning/fault states, not independent
  electrical safety checks.
- Resize the browser or use responsive device mode in developer tools.
- Expand **LOCAL PREVIEW · Demo controls** in the lower-right corner.
  Switch between **Online**, **Battery**, and **Offline**.
- Adjust load, input voltage and battery charge. The existing dashboard
  polling loop automatically picks up the simulated readings.
- Try the read-only pages and simulated settings forms. Any mock writes
  affect only this server's memory, and stop/restart resets the data.

No telemetry-history features or firmware partition changes are involved.
The preview-only controls script is never packaged into device firmware.

## Test the preview server

```sh
npm run preview:test
```

This uses Node's built-in test runner; Playwright is not required.
To test the existing browser suite separately, run `npm run e2e`.

## Scope and safety

The preview uses invented sample values and cannot access the real UPS.
Commands may report simulated success, but no command reaches any device.
The OTA firmware upload endpoint is disabled. This preview is useful for
visual and interaction testing, not hardware-specific compatibility testing.

The normal firmware build still uses `scripts/embed_web.py`, which embeds
the frontend source from `data/www`; these preview scripts are not embedded.
