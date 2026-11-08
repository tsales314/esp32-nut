// Local-only interactive preview. This module is NOT part of the ESP32 firmware.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WWW = join(ROOT, 'data', 'www');
const START = Date.now();
const ALLOWED = new Set(['index.html', 'bundle.css', 'bundle.js', 'login.html', 'login.js',
    'update.html', 'fflate.min.js', 'shared_ota.css', 'logo.png', 'favicon.ico']);
const CONTENT_TYPES = { html: 'text/html', css: 'text/css', js: 'application/javascript',
    png: 'image/png', ico: 'image/x-icon' };
const SCENARIOS = new Set(['online', 'battery', 'offline']);
const BASE_VARIABLES = [
    { name: 'battery.charge.low', description: 'Low battery threshold', value: '20', max_length: 10, enum: [], driver_side: false, confirm: false },
    { name: 'battery.runtime.low', description: 'Low runtime threshold', value: '180', max_length: 10, enum: [], driver_side: false, confirm: false },
    { name: 'input.sensitivity', description: 'Input power sensitivity', value: 'normal', max_length: 0, enum: ['high', 'normal', 'low'], driver_side: false, confirm: false },
    { name: 'ups.delay.shutdown', description: 'Shutdown delay', value: '60', max_length: 10, enum: [], driver_side: true, confirm: false }
];
const BASE_BOARD = {
    id: 'esp32s3_devkit', label: 'ESP32-S3 DevKitC-1 (simulated)',
    led: { present: true, on: true, level: 3, levels: 5 },
    usb: { ports: [{ id: 'otg', label: 'USB OTG' }], port: 'otg' },
    auto_shutdown: { on: false, available: true }
};
const BASE_SYSLOG = { enabled: false, host: '', port: 514, protocol: 'rfc3164',
    facility: 'local0', min_level: 'INFO', rate: 10 };

function initialState() {
    return { scenario: 'online', load: 24, voltage: 120.6, battery: 98,
        board: structuredClone(BASE_BOARD), variables: structuredClone(BASE_VARIABLES),
        overrides: [], syslog: { ...BASE_SYSLOG },
        time: { ntp: true, server: 'pool.ntp.org', zone: 'UTC' },
        hostname: 'esp32-nut-preview', wifiSsid: 'Demo Wi-Fi',
        nut: { ups_name: 'ups', username: 'nutadmin' } };
}
function json(res, data, code = 200, extra = {}) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
    res.end(JSON.stringify(data));
}
async function body(req) {
    let raw = '';
    for await (const part of req) {
        raw += part.toString('utf8');
        if (raw.length > 32768) throw new Error('Request too large');
    }
    return raw ? JSON.parse(raw) : {};
}
function telemetry(s) {
    if (s.scenario === 'offline') return { _disconnected: true };
    const battery = s.scenario === 'battery';
    const wave = Math.sin((Date.now() - START) / 11000);
    const runtime = Math.max(120, Math.round((145 - s.load * 1.5) * 60 * s.battery / 100));
    return {
        'ups.status': battery ? 'OB' : 'OL', 'ups.mfr': 'APC',
        'ups.model': 'Smart-UPS 1500 (Demo)', 'ups.serial': 'PREVIEW-123456',
        'ups.firmware': 'Demo 1.0',
        'battery.charge': String(s.battery), 'battery.runtime': String(runtime),
        'battery.status': s.battery < 20 ? 'low' : 'ok',
        'battery.health': 'good',
        'battery.voltage': (27.2 + wave * .12).toFixed(1),
        'battery.voltage.nominal': '24', 'ups.load': String(s.load),
        'ups.power': String(Math.round(s.load * 12)),
        'ups.realpower': String(Math.round(s.load * 9)),
        'ups.power.nominal': '1500',
        'input.voltage': battery ? '0.0' : (s.voltage + wave * .3).toFixed(1),
        'input.voltage.nominal': '120',
        'input.quality': battery ? 'On Battery' : 'Normal',
        'output.voltage': (120.1 + wave * .2).toFixed(1),
        'input.frequency': battery ? '0.0' : '60.0', 'output.frequency': '60.0',
        'ups.temperature': (28.5 + wave * .3).toFixed(1),
        'ups.beeper.status': 'enabled', 'driver.name': 'usbhid-ups', 'driver.version': '0.54'
    };
}
function systemStatus(s) {
    const offline = s.scenario === 'offline';
    return {
        version: 'v1.14.0 LOCAL PREVIEW', device_id: 'DEMO-S3',
        wifi: { status: 'Connected', ssid: s.wifiSsid, ip: '192.168.1.126' },
        ups: { status: offline ? 'Disconnected' : s.scenario === 'battery' ? 'On Battery' : 'Connected', stale: false },
        network: { type: 'wifi', state: 'connected', ssid: s.wifiSsid,
            ip: '192.168.1.126', gateway: '192.168.1.1',
            mac: '3C:84:27:C1:2A:F0', dhcp: true, rssi: -58 }
    };
}
function overrideResponse(s) {
    return { max: 16, max_value_length: 64, max_description_length: 64,
        overrides: s.overrides.map(v => ({ ...v, ups_value: telemetry(s)[v.key.toLowerCase()] ?? null })) };
}
const LOGS = [
    { id: 1, time: 200, level: 'INFO', msg: 'Preview server started (simulated device)' },
    { id: 2, time: 1550, level: 'INFO', msg: 'APC Smart-UPS 1500 demo connected' },
    { id: 3, time: 2900, level: 'INFO', msg: 'NUT service ready' }
];
const COMMANDS = [
    { name: 'beeper.enable', description: 'Enable the UPS beeper', destructive: false },
    { name: 'test.battery.start.quick', description: 'Run a quick battery test', destructive: false },
    { name: 'shutdown.return', description: 'Turn off load and restart on utility power', destructive: true }
];
function handleGetApi(res, p, s) {
    if (p === '/api/ups-vars') return json(res, telemetry(s));
    if (p === '/api/system-status') return json(res, systemStatus(s));
    if (p === '/api/auth/status') return json(res, { configured: true,
        authenticated: true, ap_mode: false, username: 'demo' });
    if (p === '/api/config') return json(res, {
        wifi: { mode: 'STA', ssid: s.wifiSsid },
        network: { type: 'wifi', links: ['wifi'],
            hostname: { name: s.hostname, custom: s.hostname, default: 'esp32-nut-demo' } },
        nut: s.nut });
    if (p === '/api/ups/commands') return json(res, {
        connected: s.scenario !== 'offline', commands: s.scenario === 'offline' ? [] : COMMANDS });
    if (p === '/api/ups/variables') return json(res, {
        connected: s.scenario !== 'offline', variables: s.scenario === 'offline' ? [] : s.variables });
    if (p === '/api/nut/overrides') return json(res, overrideResponse(s));
    if (p === '/api/logs') return json(res, LOGS, 200, { 'X-Uptime-Ms': String(Date.now() - START) });
    if (p === '/api/logging') return json(res, {
        syslog: s.syslog,
        status: { syslog: { state: 'disabled', target: '', error: '',
            sent: 0, failed: 0, rate_limited: 0, not_ready: 0 } },
        options: { protocols: ['rfc3164', 'rfc5424'],
            facilities: ['user', 'daemon', 'local0', 'local1', 'local2', 'local3'],
            levels: ['INFO', 'WARN', 'ERROR'], rate_min: 1, rate_max: 100 } });
    if (p === '/api/board') return json(res, s.board);
    if (p === '/api/time') return json(res, { time: s.time,
        status: { state: 'synchronized',
            local: new Date().toISOString().slice(0, 19).replace('T', ' '),
            abbr: 'UTC', utc: new Date().toISOString(), since_sync_s: 30 },
        options: { zones: ['UTC', 'America/Los_Angeles', 'America/New_York',
            'Europe/London', 'Europe/Rome', 'Asia/Tokyo'] } });
    if (p === '/api/usb/dump/read') return json(res, { available: false });
    return json(res, { error: 'No preview data for ' + p }, 404);
}
async function handlePostApi(req, res, p, s) {
    const d = await body(req);
    // Every write in preview mode changes process memory only, never hardware.
    if (p === '/api/ups/command') return json(res, { success: true });
    if (p === '/api/ups/variable' || p === '/api/ups/variable/reset') {
        const v = s.variables.find(x => x.name === d.name);
        if (!v) return json(res, { error: 'Unknown simulated variable' }, 400);
        const original = BASE_VARIABLES.find(x => x.name === d.name);
        v.value = p.endsWith('/reset') ? original.value : String(d.value);
        return json(res, { success: true, value: v.value });
    }
    if (p === '/api/nut/overrides') {
        s.overrides = Array.isArray(d.overrides) ? d.overrides.slice(0, 16) : [];
        return json(res, overrideResponse(s));
    }
    if (p === '/api/nut/config') { s.nut = { ...s.nut, ...d }; return json(res, { success: true }); }
    if (p === '/api/logging') { s.syslog = { ...s.syslog, ...(d.syslog || {}) }; return json(res, { success: true }); }
    if (p === '/api/time') { s.time = { ...s.time, ...(d.time || {}) }; return json(res, { success: true }); }
    if (p === '/api/board') {
        if (typeof d.led_on === 'boolean') s.board.led.on = d.led_on;
        if (Number.isInteger(d.led_level)) s.board.led.level = d.led_level;
        if (typeof d.auto_shutdown === 'boolean') s.board.auto_shutdown.on = d.auto_shutdown;
        return json(res, { success: true, restart: false });
    }
    if (p === '/api/network/hostname') {
        if (typeof d.hostname === 'string') s.hostname = d.hostname || 'esp32-nut-demo';
        return json(res, { success: true, restart: false });
    }
    if (p === '/api/auth/credentials' || p === '/api/auth/logout' || p === '/api/auth/logout-all') {
        return json(res, { success: true });
    }
    if (p === '/api/wifi/connect') return json(res, { error: 'No Wi-Fi change in preview mode' }, 400);
    return json(res, { error: 'No hardware action is possible in preview mode' }, 403);
}
async function sendAsset(res, file) {
    try {
        let data = await readFile(join(WWW, file));
        if (file === 'index.html') {
            data = Buffer.from(data.toString('utf8').replace('</body>',
                '<script defer src="/__preview/controls.js"></script>\n</body>'));
        }
        const ext = file.slice(file.lastIndexOf('.') + 1);
        res.writeHead(200, { 'Content-Type': (CONTENT_TYPES[ext] || 'application/octet-stream') +
            (['html', 'css', 'js'].includes(ext) ? '; charset=utf-8' : ''),
            'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(data);
    } catch { json(res, { error: 'Missing preview asset' }, 404); }
}
export function createPreviewServer() {
    const s = initialState();
    return createServer(async (req, res) => {
        try {
            const p = new URL(req.url || '/', 'http://127.0.0.1').pathname;
            if (p === '/__preview/state') {
                if (req.method === 'GET') return json(res, {
                    scenario: s.scenario, load: s.load, voltage: s.voltage, battery: s.battery });
                if (req.method !== 'POST') return json(res, { error: 'Method not allowed' }, 405);
                const d = await body(req);
                if (d.scenario !== undefined) {
                    if (!SCENARIOS.has(d.scenario)) return json(res, { error: 'Invalid scenario' }, 400);
                    s.scenario = d.scenario;
                }
                for (const [key, lo, hi] of [['load', 0, 100], ['voltage', 90, 140], ['battery', 0, 100]]) {
                    if (d[key] === undefined) continue;
                    const value = Number(d[key]);
                    if (!Number.isFinite(value) || value < lo || value > hi) {
                        return json(res, { error: 'Invalid ' + key }, 400);
                    }
                    s[key] = value;
                }
                if (d.reset === true) Object.assign(s, initialState());
                return json(res, { scenario: s.scenario, load: s.load,
                    voltage: s.voltage, battery: s.battery });
            }
            if (p === '/__preview/controls.js' && req.method === 'GET') {
                const code = await readFile(join(ROOT, 'scripts', 'preview-controls.js'));
                res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8',
                    'Cache-Control': 'no-store' });
                return res.end(code);
            }
            if (p.startsWith('/api/')) {
                if (req.method === 'GET') return handleGetApi(res, p, s);
                if (req.method === 'POST') return handlePostApi(req, res, p, s);
                return json(res, { error: 'Method not allowed' }, 405);
            }
            if (req.method !== 'GET') return json(res, {
                error: 'Flashing and other hardware actions are disabled in preview mode'
            }, 403);
            if (p === '/shared.css') {
                const a = await readFile(join(WWW, 'bundle.css'));
                const b = await readFile(join(WWW, 'shared_ota.css'));
                res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
                return res.end(Buffer.concat([a, Buffer.from('\n'), b]));
            }
            if (p === '/mobile.css') {
                res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
                return res.end('');
            }
            const asset = p === '/' ? 'index.html' : p === '/update' ? 'update.html' :
                p === '/login' ? 'login.html' : p.slice(1);
            if (!ALLOWED.has(asset)) return json(res, { error: 'Not found' }, 404);
            return sendAsset(res, asset);
        } catch (err) {
            console.error('[preview]', err);
            if (!res.headersSent) json(res, { error: 'Invalid preview request' }, 400);
            else res.end();
        }
    });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
    createPreviewServer().listen(port, '127.0.0.1', () => {
        console.log('ESP32-NUT UI preview: http://127.0.0.1:' + port);
        console.log('Simulated UPS and settings only. No ESP32 is contacted.');
        console.log('Press Ctrl+C to stop.');
    });
}
