const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DOMParser } = require('linkedom');
const C = require('../src/core.js');
const serialCard = '<div class="short-item"><a class="short-img" href="/123-test.html"><img data-src="/poster.jpg" alt="Тестовий серіал"></a><div class="short-title">Тестовий серіал</div></div>';

test('catalog parses cards, resolves relative addresses and ignores foreign links', () => {
    const rows = C.catalog('uaserials', serialCard + serialCard + '<div class="short-item"><a href="https://foreign.example/a.html">x</a><div class="short-title">Foreign</div></div>', C.provider('uaserials').home, DOMParser);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, 'Тестовий серіал');
    assert.equal(rows[0].url, 'https://uaserials.my/123-test.html');
    assert.equal(rows[0].poster, 'https://uaserials.my/poster.jpg');
});
test('UAKino markup and ordinary no-results page', () => {
    const html = '<div class="movie-item"><div class="movie-title"><a href="/ua/456-test.html">Фільм</a></div><img src="/img.jpg"></div>';
    assert.equal(C.catalog('uakino', html, C.provider('uakino').home, DOMParser)[0].title, 'Фільм');
    assert.deepEqual(C.catalog('uaserials', '<html><body>Нічого не знайдено</body></html>', C.provider('uaserials').home, DOMParser), []);
});
test('challenge is distinguished from a CAPTCHA widget on a normal page', () => {
    assert.throws(() => C.catalog('uaserials', '<title>Just a moment...</title>', C.provider('uaserials').home, DOMParser), { code: 'BLOCKED' });
    assert.equal(C.catalog('uaserials', serialCard + '<div class="g-recaptcha"></div>', C.provider('uaserials').home, DOMParser).length, 1);
});
test('only public HTTPS URLs and known HTML player hosts are fetched', () => {
    for (const u of ['http://example.com/', 'file:///sdcard/a', 'javascript:alert(1)', 'https://127.0.0.1/a', 'https://2130706433/a', 'https://[::1]/a', 'https://router.local/a', 'https://u:p@example.com/a', 'https://example.com:8080/a']) assert.throws(() => C.safeUrl(u), { code: 'URL' });
    assert.equal(C.permitted('https://ashdi.vip/player/123', 'uaserials'), 'https://ashdi.vip/player/123');
    assert.throws(() => C.permitted('https://ashdi.vip.evil.example/player', 'uaserials'), { code: 'HOST' });
});
test('HTML pages and query parameters cannot masquerade as media paths', () => {
    assert.equal(C.mediaUrl('https://cdn.example/movie.m3u8?token=abc'), 'https://cdn.example/movie.m3u8?token=abc');
    assert.throws(() => C.mediaUrl('https://cdn.example/player.html?file=film.mp4'), { code: 'STREAM' });
    assert.throws(() => C.mediaUrl('https://cdn.example/player.html'), { code: 'STREAM' });
});
test('nested Playerjs playlists preserve season, episode and voice labels', () => {
    const html = '<script>new Playerjs({file:[{"title":"Озвучення А","folder":[{"title":"Сезон 1","folder":[{"title":"Серія 2","file":"[720p]https://cdn.example/a.m3u8,[1080p]https://cdn.example/b.m3u8"}]}]}]});</script>';
    const rows = C.detail('uaserials', html, 'https://uaserials.my/123-test.html', DOMParser);
    assert.equal(rows.length, 2);
    assert.match(rows[0].title, /Озвучення А.*Сезон 1.*Серія 2.*720p/);
    assert.equal(rows[1].url, 'https://cdn.example/b.m3u8');
});
test('downloaded scripts remain inert and unsupported players report failure', () => {
    global.__ua3_executed = false;
    assert.throws(() => C.detail('uaserials', '<script>global.__ua3_executed=true;file:steal()</script>', 'https://uaserials.my/123-test.html', DOMParser), { code: 'FORMAT' });
    assert.equal(global.__ua3_executed, false);
    delete global.__ua3_executed;
    assert.throws(() => C.detail('uaserials', '<iframe src="https://unknown.example/player"></iframe>', 'https://uaserials.my/123-test.html', DOMParser), { code: 'PLAYER' });
});
test('a quoted JSON playlist retains labels through season, voice and episode nesting', () => {
    const playlist = [{ title: 'Сезон 1', folder: [{ title: 'Студія', folder: [{ title: 'Серія 8', file: 'https://cdn.example/8.m3u8' }] }] }];
    const rows = C.detail('uaserials', `<script>new Playerjs({file:'${JSON.stringify(playlist)}'});</script>`, 'https://hdvbua.pro/embed/123', DOMParser);
    assert.equal(rows.length, 1); assert.match(rows[0].title, /Сезон 1.*Студія.*Серія 8/);
});
test('UAKino public playlist URL retains required values', () => {
    const rows = C.detail('uakino', '<div class="playlists-ajax" data-news_id="123" data-xfname="playlist2"></div><script>var dle_edittime="456";</script>', 'https://uakino.best/ua/123-film.html', DOMParser);
    const u = new URL(rows[0].url);
    assert.equal(u.pathname, '/engine/ajax/playlists.php');
    assert.equal(u.searchParams.get('news_id'), '123');
    assert.equal(u.searchParams.get('xfield'), 'playlist2');
    assert.equal(u.searchParams.get('time'), '456');
});
test('playlist traversal and result count are bounded', () => {
    const entries = Array.from({ length: 900 }, (_, i) => ({ title: `Episode ${i}`, file: `https://cdn.example/${i}.mp4` }));
    assert.equal(C.flatten(entries, 'https://uaserials.my/').length, 300);
    let nested = 'https://cdn.example/video.mp4'; for (let i = 0; i < 20; i++) nested = [nested];
    assert.deepEqual(C.flatten(nested, 'https://uaserials.my/'), []);
});
test('Teleportal search, seasons and episodes retain the public API hierarchy', () => {
    const cards = C.tpSearch([null, { title: 'Шоу', typeSlug: 'shows', channelSlug: 'stb', projectSlug: 'show' }]);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].url, 'https://tp-back.starlight.digital/ua/shows/stb/show');
    const rows = C.tpProject({ seasonsGallery: [{ seasonSlug: 'season-1', title: 'Сезон 1', items: [{ hash: 'abc123', title: 'Серія 1' }] }], seasons: [{ seasonSlug: 'season-1' }, { seasonSlug: 'season-2' }] }, cards[0].url);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].kind, 'tp-stream'); assert.match(rows[0].title, /Сезон 1.*Серія 1/);
    assert.equal(rows[1].url, cards[0].url + '/season-2');
    assert.match(C.tpPlayerUrl(rows[0].hash), /player-api\/abc123\?/);
});
test('Teleportal malformed shapes have readable errors and bounded output', () => {
    assert.throws(() => C.tpProject({ seasons: {} }, 'https://tp-back.starlight.digital/ua/a/b/c'), { code: 'FORMAT' });
    assert.throws(() => C.tpStreams({ video: {} }), { code: 'FORMAT' });
    assert.throws(() => C.tpPlayerUrl('../private'), { code: 'FORMAT' });
    const items = Array.from({ length: 900 }, (_, i) => ({ hash: `hash${i}`, title: `Episode ${i}` }));
    assert.equal(C.tpProject({ items }, 'https://tp-back.starlight.digital/ua/a/b/c').length, 300);
});
test('Teleportal exposes actual media and rejects empty availability', () => {
    assert.equal(C.tpStreams({ name: 'Шоу', video: [{ mediaHls: 'https://cdn.example/a.m3u8', media: [{ quality: '720p', url: 'https://cdn.example/a.mp4' }] }] }).length, 2);
    assert.throws(() => C.tpStreams({ video: [] }), { code: 'STREAM' });
    assert.equal(C.networkError(403).code, 'BLOCKED'); assert.equal(C.networkError(401).code, 'AUTH');
});
test('Teleportal canonical HLS endpoint keeps its complete URL and query', () => {
    const url = 'https://vcms-api2.starlight.digital/hls/multi?file=https%3A%2F%2Fcdn.example%2Fvideo.mp4&hash=abc&testadv=1';
    assert.equal(C.tpStreams({ video: [{ mediaHls: url }] })[0].url, url);
    assert.throws(() => C.mediaUrl('https://other.example/hls/multi?file=video.mp4'), { code: 'STREAM' });
});
test('Teleportal prefers its supplied primary media URL and keeps the other HLS as an alternative', () => {
    const plain = 'https://vcms-api2.starlight.digital/hls/multi?file=https%3A%2F%2Fcdn.example%2Fv.mp4&hash=abc';
    const alternative = plain + '&testadv=1';
    const rows = C.tpStreams({ name: 'Випуск', video: [{ mediaHlsNoAdv: plain, mediaHls: alternative, media: [{ quality: 'auto', url: plain }] }] });
    assert.equal(rows.length, 2); assert.equal(rows[0].url, plain); assert.equal(rows[0].title, 'Випуск');
    assert.equal(rows[1].url, alternative);
});
