const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML, DOMParser } = require('linkedom');
const core = fs.readFileSync(path.join(__dirname, '../src/core.js'), 'utf8');
const adapter = fs.readFileSync(path.join(__dirname, '../src/lampa.js'), 'utf8');
const flush = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };

function harness(ready = true, jquery = false) {
    const { document, Event } = parseHTML('<html><head></head><body></body></html>');
    const requests = [], components = {}, controllers = {}, menus = [], calls = [], listeners = {}, timers = new Map(), scrolls = []; let timerId = 0;
    const L = {
        Component: { add: (name, ctor) => { calls.push('register'); components[name] = ctor; } },
        Menu: { addButton: (icon, name, action) => menus.push({ name, action }) },
        Listener: { follow: (name, fn) => { (listeners[name] ||= []).push(fn); } },
        Scroll: function () {
            const root = document.createElement('div'); let position = 0;
            this.render = () => root;
            this.append = node => root.appendChild(node);
            this.minus = () => root.classList.add('layer--wheight');
            // Model the native Scroll clamp: an unbounded root grows to its
            // content height, so there is no overflow and the offset stays 0.
            this.update = node => {
                const rows = [...root.querySelectorAll('.ua3-row')];
                const height = rows.length * 100 + 120;
                const viewport = Number.parseFloat(root.style.height) || height;
                const rowTop = 80 + rows.indexOf(node) * 100;
                position = Math.max(0, Math.min(height - viewport, rowTop + 50 - viewport / 2));
            };
            this.position = () => position;
            this.destroy = () => root.remove();
            scrolls.push(this);
        },
        Layer: { update: root => { if (root.classList.contains('layer--wheight')) root.style.height = '600px'; } },
        Controller: { add: (name, value) => { controllers[name] = value; }, collectionSet() {}, collectionFocus(last) { assert.ok(!last || last.nodeType === 1); if (last) calls.push({ focused: last }); }, toggle: name => { calls.push('toggle:' + name); if (controllers[name]) controllers[name].toggle(); } },
        Reguest: function () { this.cleared = 0; this.native = (url, success, fail, post, options) => { this.fail = fail; requests.push({ url, success, fail, options, network: this }); }; this.clear = () => { this.cleared++; if (this.fail) this.fail({ status: 0 }); }; },
        Activity: { push: params => calls.push(params), backward: () => calls.push('back') },
        Player: { play: value => calls.push({ play: value }), playlist: value => calls.push({ playlist: value }) },
        Noty: { show: value => calls.push({ notice: value }) }
    };
    const window = { Lampa: L, appready: ready, document, Navigator: function Navigator() {} };
    if (jquery) window.$ = node => {
        node.on = (type, callback) => { node.addEventListener(type, callback); return node; };
        return node;
    };
    const context = vm.createContext({ window, document, DOMParser, URL, Promise, console, setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) });
    vm.runInContext(core, context); vm.runInContext(adapter, context);
    function create(params = {}) { const c = new components.ua_three_sources(params); c.activity = { loader: value => calls.push({ loader: value }) }; const root = c.create(); document.body.appendChild(root); c.start(); return { c, root }; }
    return { window, L, context, document, Event, requests, components, controllers, menus, calls, listeners, timers, scrolls, create };
}
test('registers once and handles the app ready event', async () => {
    const h = harness(false); assert.equal(h.menus.length, 0); h.window.appready = true; h.listeners.app[0]({ type: 'ready' });
    vm.runInContext(adapter, h.context);
    assert.equal(h.calls.filter(x => x === 'register').length, 1); assert.equal(h.menus.length, 1);
    const { root } = h.create(); await flush(); assert.equal(root.querySelectorAll('.ua3-row').length, 4);
});
test('native browser Navigator constructor cannot break D-pad handlers', () => {
    const h = harness(); h.create(); h.controllers.content.up(); h.controllers.content.down(); h.controllers.content.right();
    assert.ok(h.calls.includes('toggle:head'));
});
test('D-pad moves through the visible rows without private Navigator APIs', () => {
    const h = harness(); const { root } = h.create();
    const rows = root.querySelectorAll('.ua3-row');
    h.controllers.content.down(); assert.equal(h.calls.filter(c => c && c.focused).at(-1).focused, rows[1]);
    h.controllers.content.down(); assert.equal(h.calls.filter(c => c && c.focused).at(-1).focused, rows[2]);
    h.controllers.content.up(); assert.equal(h.calls.filter(c => c && c.focused).at(-1).focused, rows[1]);
});

test('long search keeps the selected row inside the viewport in both directions', async () => {
    const h = harness(); const { root } = h.create({ mode: 'catalog', provider: 'uaserials', query: 'готель' });
    h.requests[0].success(Array.from({ length: 20 }, (_, i) => '<div class="short-item"><a href="/' + (100 + i) + '-hotel.html">a</a><div class="short-title">Готель ' + i + '</div></div>').join(''));
    await flush();
    const rows = [...root.querySelectorAll('.ua3-row')];
    function assertVisible(index) {
        assert.equal(h.calls.filter(c => c && c.focused).at(-1).focused, rows[index]);
        const top = 80 + index * 100 - h.scrolls[0].position();
        assert.ok(top >= 0 && top + 100 <= 600, 'selected row ' + index + ' must stay fully visible, top=' + top);
    }
    for (let i = 1; i < rows.length; i++) { h.controllers.content.down(); assertVisible(i); }
    assert.ok(h.scrolls[0].position() > 1000, 'the list must move, not only its focus');
    for (let i = rows.length - 2; i >= 0; i--) { h.controllers.content.up(); assertVisible(i); }
    assert.equal(h.scrolls[0].position(), 0);
});
test('the public Controller enter handler activates the selected row', () => {
    const h = harness(); h.create();
    h.controllers.content.down(); h.controllers.content.down(); h.controllers.content.enter();
    assert.equal(h.calls.find(c => c && c.mode === 'catalog').provider, 'uakino');
});
test('Lampa virtual focus owns OK; stale DOM focus cannot activate a different row', () => {
    const h = harness(true, true); const { root } = h.create();
    const rows = root.querySelectorAll('.ua3-row');
    h.controllers.content.down();
    const key = new h.Event('keydown'); key.key = 'Enter'; rows[0].dispatchEvent(key);
    assert.doesNotMatch(root.textContent, /У цій версії Lampa не знайдено/);
    rows[1].dispatchEvent(new h.Event('hover:enter'));
    assert.equal(h.calls.find(c => c && c.mode === 'catalog').provider, 'uaserials');
});
test('remote key ownership is unchanged when Lampa does not expose jQuery', () => {
    const h = harness(); const { root } = h.create();
    const rows = root.querySelectorAll('.ua3-row'); h.controllers.content.down();
    const key = new h.Event('keydown'); key.key = 'Enter'; rows[0].dispatchEvent(key);
    assert.doesNotMatch(root.textContent, /У цій версії Lampa не знайдено/);
    rows[1].dispatchEvent(new h.Event('hover:enter'));
    assert.equal(h.calls.find(c => c && c.mode === 'catalog').provider, 'uaserials');
});
test('destroy cancels pending callbacks and clears the original network instance', async () => {
    const h = harness(); const { c, root } = h.create({ mode: 'catalog', provider: 'uaserials' }); assert.equal(h.requests.length, 1);
    c.destroy(); assert.equal(h.requests[0].network.cleared, 1);
    h.requests[0].success('<div>late response</div>'); await flush(); assert.equal(root.parentNode, null); assert.equal(h.timers.size, 0);
});
test('timeout survives a synchronous error callback from clear()', async () => {
    const h = harness(); const { root } = h.create({ mode: 'catalog', provider: 'uaserials' });
    [...h.timers.values()].find(t => t.ms === 35000).fn(); await flush();
    assert.match(root.textContent, /TIMEOUT/); assert.doesNotMatch(root.textContent, /Статус: NETWORK/);
});
test('one failed provider does not discard another provider search result', async () => {
    const h = harness(); const { root } = h.create({ mode: 'search', query: 'Тест' });
    for (const r of h.requests) {
        if (r.url.includes('uaserials')) r.success('<div class="short-item"><a href="/123-test.html">a</a><div class="short-title">Знайдений серіал</div></div>');
        else if (r.url.includes('uakino')) r.fail({ status: 403 }); else r.success('[]');
    }
    await flush(); assert.match(root.textContent, /Знайдений серіал/); assert.match(root.textContent, /UAKino:.*відхилило/); assert.ok(h.calls.some(c => c && c.loader === false));
});
test('direct media choice starts Lampa player with a validated stream', async () => {
    const h = harness(); const { root } = h.create({ mode: 'detail', provider: 'uaserials', url: 'https://uaserials.my/123-test.html', title: 'Серіал' });
    h.requests[0].success('<video src="https://cdn.example/video.m3u8?token=test"></video>'); await flush();
    root.querySelector('.ua3-row').dispatchEvent(new h.Event('click'));
    assert.equal(h.calls.find(c => c && c.play).play.url, 'https://cdn.example/video.m3u8?token=test');
    assert.equal(h.calls.find(c => c && c.playlist).playlist.length, 1);
});
test('a season keeps its episodes in the player playlist', async () => {
    const h = harness(); const { root } = h.create({ mode: 'detail', provider: 'uaserials', url: 'https://uaserials.my/123-test.html', title: 'Серіал' });
    h.requests[0].success('<script>new Playerjs({file:[{"title":"Серія 1","file":"https://cdn.example/1.m3u8"},{"title":"Серія 2","file":"https://cdn.example/2.m3u8"}]});</script>'); await flush();
    root.querySelectorAll('.ua3-row')[1].dispatchEvent(new h.Event('click'));
    assert.equal(h.calls.find(c => c && c.play).play.url, 'https://cdn.example/2.m3u8');
    assert.equal(h.calls.find(c => c && c.playlist).playlist.length, 2);
});
test('a failed request offers retry with a fresh request', async () => {
    const h = harness(); const { root } = h.create({ mode: 'catalog', provider: 'uaserials' });
    h.requests[0].fail({ status: 0 }); await flush();
    [...root.querySelectorAll('.ua3-row')].find(n => /Повторити/.test(n.textContent)).dispatchEvent(new h.Event('click'));
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].options.timeout, 30000);
});
test('HTML player cycles terminate without another request', async () => {
    const h = harness(); const { root } = h.create({ mode: 'detail', provider: 'uaserials', url: 'https://uaserials.my/123-test.html', visited: ['https://uaserials.my/123-test.html'] });
    await flush(); assert.equal(h.requests.length, 0); assert.match(root.textContent, /Повторні переходи зупинено/);
});
