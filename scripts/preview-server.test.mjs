import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewServer } from './preview-server.mjs';

let server;
let origin;

before(async () => {
    server = createPreviewServer();
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    origin = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
    if (server) await new Promise((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve()));
});

async function getJson(path) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    return response.json();
}

async function postJson(path, payload) {
    return fetch(origin + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

test('serves the actual UI and the preview-only control script', async () => {
    const res = await fetch(origin + '/');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /id="metrics-grid"/);
    assert.match(html, /id="nav-toggle"/);
    assert.match(html, /\/__preview\/controls\.js/);
    const controls = await fetch(origin + '/__preview/controls.js');
    assert.equal(controls.status, 200);
    assert.match(await controls.text(), /LOCAL PREVIEW/);
    const bundle = await fetch(origin + '/bundle.js?v=1.2.0');
    assert.equal(bundle.status, 200);
    assert.match(await bundle.text(), /function renderMetrics/);
});

test('simulated variables update without contacting any device', async () => {
    const base = await getJson('/api/ups-vars');
    assert.equal(base['ups.status'], 'OL');
    assert.equal(base['ups.load'], '24');
    const change = await postJson('/__preview/state', {
        scenario: 'battery', load: 35, battery: 72
    });
    assert.equal(change.status, 200);
    const updated = await getJson('/api/ups-vars');
    assert.equal(updated['ups.status'], 'OB');
    assert.equal(updated['ups.load'], '35');
    assert.equal(updated['battery.charge'], '72');
    const status = await getJson('/api/system-status');
    assert.equal(status.ups.status, 'On Battery');
    await postJson('/__preview/state', { scenario: 'offline' });
    const offline = await getJson('/api/ups-vars');
    assert.equal(offline._disconnected, true);
    assert.equal((await getJson('/api/ups/commands')).commands.length, 0);
    await postJson('/__preview/state', { reset: true });
    assert.equal((await getJson('/api/ups-vars'))['ups.status'], 'OL');
});

test('shows all mock configuration sections without real device access', async () => {
    const config = await getJson('/api/config');
    assert.equal(config.network.type, 'wifi');
    assert.equal((await getJson('/api/board')).id, 'esp32s3_devkit');
    assert.ok((await getJson('/api/ups/variables')).variables.length > 0);
    assert.ok(Array.isArray((await getJson('/api/ups/commands')).commands));
    assert.ok(Array.isArray(await getJson('/api/logs')));
    assert.equal((await getJson('/api/auth/status')).authenticated, true);
    assert.equal((await getJson('/api/time')).time.zone, 'UTC');
});

test('safe boundaries: localhost-only simulated writes and no firmware upload', async () => {
    const flash = await postJson('/update', { data: 'pretend firmware' });
    assert.equal(flash.status, 403);
    const files = await fetch(origin + '/package.json');
    assert.equal(files.status, 404);
    const invalid = await postJson('/__preview/state', { scenario: 'unsafe' });
    assert.equal(invalid.status, 400);
    const action = await postJson('/api/ups/command', { name: 'shutdown.return' });
    assert.equal(action.status, 200);
    assert.equal((await getJson('/api/ups-vars'))['ups.status'], 'OL');
});
