// Injected ONLY into localhost preview; not included in the ESP32 firmware.
(() => {
    const style = document.createElement('style');
    style.textContent = [
        '#nut-preview-panel{position:fixed;z-index:120;right:14px;bottom:14px;width:min(310px,calc(100vw - 28px));color:#e8f4f7;background:#101c27;border:1px solid #19d9e3;border-radius:12px;box-shadow:0 14px 44px #0008;font:13px/1.45 system-ui,sans-serif}',
        '#nut-preview-panel button{font:inherit;color:inherit;cursor:pointer}',
        '#nut-preview-toggle{width:100%;padding:11px 14px;border:0;border-radius:12px;background:#112e36;color:#53f0f2!important;font-weight:700!important;display:flex;align-items:center;justify-content:space-between}',
        '#nut-preview-body{padding:12px 14px 14px;display:grid;gap:12px}#nut-preview-body[hidden]{display:none!important}',
        '#nut-preview-panel .nut-scenarios{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}',
        '#nut-preview-panel .nut-scenarios button{padding:7px 3px;background:#1d3140;border:1px solid #36515e;border-radius:7px}',
        '#nut-preview-panel .nut-scenarios button[aria-pressed=true]{background:#14565a;border-color:#50f3ea}',
        '#nut-preview-panel label{display:flex;justify-content:space-between;gap:10px}',
        '#nut-preview-panel input[type=range]{display:block;width:100%;accent-color:#34e8e8}',
        '#nut-preview-panel small{color:#a5c4c8}',
        '#nut-preview-panel .nut-reset{width:100%;padding:7px;border-radius:7px;background:#233642;border:1px solid #49606c}',
        '#nut-preview-panel .nut-feedback{min-height:16px;font-size:12px;color:#d5c580}',
        '@media(max-width:600px){#nut-preview-panel{right:8px;bottom:8px;width:min(310px,calc(100vw - 16px))}}'
    ].join('\n');
    document.head.append(style);
    const panel = document.createElement('aside');
    panel.id = 'nut-preview-panel';
    panel.setAttribute('aria-label', 'Local simulated UPS controls');
    panel.innerHTML = [
        '<button type="button" id="nut-preview-toggle" aria-expanded="false"><span>LOCAL PREVIEW · Demo controls</span><span id="nut-preview-arrow">▴</span></button>',
        '<div id="nut-preview-body" hidden>',
        '<strong>Simulated power state</strong>',
        '<div class="nut-scenarios">',
        '<button type="button" data-scenario="online" aria-pressed="true">Online</button>',
        '<button type="button" data-scenario="battery" aria-pressed="false">Battery</button>',
        '<button type="button" data-scenario="offline" aria-pressed="false">Offline</button>',
        '</div>',
        '<div><label for="nut-preview-load">UPS load <output id="nut-preview-load-value">24%</output></label>',
        '<input id="nut-preview-load" type="range" min="0" max="100" value="24"></div>',
        '<div><label for="nut-preview-voltage">Input voltage <output id="nut-preview-voltage-value">120.6 V</output></label>',
        '<input id="nut-preview-voltage" type="range" min="90" max="140" step="0.1" value="120.6"></div>',
        '<div><label for="nut-preview-battery">Battery charge <output id="nut-preview-battery-value">98%</output></label>',
        '<input id="nut-preview-battery" type="range" min="0" max="100" value="98"></div>',
        '<button type="button" class="nut-reset" id="nut-preview-reset">Reset simulated readings</button>',
        '<small>Nothing connects to a real device. Changes only exist in this local server.</small>',
        '<div role="status" class="nut-feedback" id="nut-preview-feedback"></div></div>'
    ].join('');
    document.body.append(panel);

    const get = id => panel.querySelector('#' + id);
    const controls = get('nut-preview-body');
    get('nut-preview-toggle').addEventListener('click', () => {
        controls.hidden = !controls.hidden;
        get('nut-preview-toggle').setAttribute('aria-expanded', String(!controls.hidden));
        get('nut-preview-arrow').textContent = controls.hidden ? '▴' : '▾';
    });

    const fields = {
        load: [get('nut-preview-load'), get('nut-preview-load-value'), '%'],
        voltage: [get('nut-preview-voltage'), get('nut-preview-voltage-value'), ' V'],
        battery: [get('nut-preview-battery'), get('nut-preview-battery-value'), '%']
    };
    const feedback = get('nut-preview-feedback');
    function show(s) {
        for (const button of panel.querySelectorAll('[data-scenario]')) {
            button.setAttribute('aria-pressed', String(button.dataset.scenario === s.scenario));
        }
        for (const [key, items] of Object.entries(fields)) {
            items[0].value = String(s[key]);
            items[1].textContent = String(s[key]) + items[2];
        }
    }
    async function send(patch) {
        try {
            const response = await fetch('/__preview/state', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch)
            });
            if (!response.ok) throw new Error('Update failed');
            show(await response.json());
            feedback.textContent = 'Simulated readings updated. The dashboard refreshes automatically.';
        } catch (error) {
            feedback.textContent = String(error.message || error);
        }
    }
    for (const button of panel.querySelectorAll('[data-scenario]')) {
        button.addEventListener('click', () => send({ scenario: button.dataset.scenario }));
    }
    for (const [key, items] of Object.entries(fields)) {
        let debounce;
        items[0].addEventListener('input', () => {
            items[1].textContent = items[0].value + items[2];
            clearTimeout(debounce);
            debounce = setTimeout(() => send({ [key]: Number(items[0].value) }), 150);
        });
    }
    get('nut-preview-reset').addEventListener('click', () => send({ reset: true }));
    fetch('/__preview/state').then(r => r.json()).then(show).catch(() => {
        feedback.textContent = 'Preview control API unavailable';
    });
})();
