/* Ukrainian Sources 0.1.2. No script evaluation, third-party proxies or credential storage. */
(function (root, factory) {
    var core = factory();
    if (typeof module === 'object' && module.exports) module.exports = core;
    else root.UA3Core = core;
}(typeof window !== 'undefined' ? window : this, function () {
    'use strict';
    var providers = [
        { id: 'uaserials', name: 'UASerials', home: 'https://uaserials.my/' },
        { id: 'uakino', name: 'UAKino', home: 'https://uakino.best/' },
        { id: 'teleportal', name: 'Teleportal', home: 'https://teleportal.ua/', api: 'https://tp-back.starlight.digital/' }
    ];
    var playerHosts = ['ashdi.vip', 'ashdi.org', 'ashdi.club', 'tortuga.wtf', 'tortuga.tw', 'hdvbua.pro', 'hdvbua.com'];
    function failure(code, message) { var e = new Error(message); e.code = code; return e; }
    function provider(id) {
        for (var i = 0; i < providers.length; i++) if (providers[i].id === id) return providers[i];
        throw failure('SOURCE', 'Невідоме джерело.');
    }
    function safeUrl(value, base) {
        var url;
        try { url = new URL(String(value || '').replace(/&amp;/g, '&'), base); }
        catch (e) { throw failure('URL', 'Джерело повернуло некоректну адресу.'); }
        var host = url.hostname.toLowerCase();
        if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
            host === 'localhost' || host.indexOf('.') < 0 || /(?:\.local|\.internal|\.lan)$/.test(host) ||
            /^[\d.]+$/.test(host) || host.indexOf(':') >= 0) {
            throw failure('URL', 'Цей тип адреси не підтримується.');
        }
        url.hash = '';
        return url.href;
    }
    function permitted(url, id) {
        var clean = safeUrl(url), host = new URL(clean).hostname;
        var p = provider(id), own = new URL(p.home).hostname;
        if (host === own || (p.api && host === new URL(p.api).hostname)) return clean;
        if (id === 'teleportal' && host === 'vcms-api2.starlight.digital') return clean;
        for (var i = 0; i < playerHosts.length; i++) {
            if (host === playerHosts[i] || host.endsWith('.' + playerHosts[i])) return clean;
        }
        throw failure('HOST', 'Цей відеоплеєр ще не підтримується.');
    }
    function parseDocument(html, Parser) {
        html = String(html || '');
        if (html.length > 2500000) throw failure('SIZE', 'Відповідь джерела завелика.');
        // Match challenge pages, not an ordinary page which happens to contain a CAPTCHA widget.
        if (/<title>\s*(?:just a moment|attention required|access denied)/i.test(html) ||
            /id=["']challenge-form["']/i.test(html)) throw failure('BLOCKED', 'Сайт просить перевірку у браузері.');
        var Ctor = Parser || (typeof DOMParser !== 'undefined' && DOMParser);
        if (!Ctor) throw failure('PLATFORM', 'Ця версія Lampa не має HTML-парсера.');
        return new Ctor().parseFromString(html, 'text/html');
    }
    function text(node) { return node ? String(node.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
    function attr(node, names) {
        for (var i = 0; node && i < names.length; i++) if (node.getAttribute(names[i])) return node.getAttribute(names[i]);
        return '';
    }
    function list(nodes) { return Array.prototype.slice.call(nodes || []); }
    function unique(items, key) {
        var seen = Object.create(null);
        return items.filter(function (item) { var value = item[key]; if (!value || seen[value]) return false; seen[value] = true; return true; });
    }
    function catalogUrl(id, query, page) {
        var p = provider(id); page = Math.max(1, Number(page) || 1); query = String(query || '').trim();
        if (id === 'teleportal') {
            if (!query) return null; // Public live-search needs an actual query; never fabricate a catalog.
            return p.api + 'ua/live-search?q=' + encodeURIComponent(query.slice(0, 180));
        }
        if (query) return p.home + 'index.php?do=search&subaction=search&story=' + encodeURIComponent(query.slice(0, 180)) + '&search_start=' + page;
        return page === 1 ? p.home : p.home + 'page/' + page + '/';
    }
    function catalog(id, html, base, Parser) {
        var doc = parseDocument(html, Parser), own = new URL(provider(id).home).hostname;
        var selector = id === 'uaserials' ? '.short-item' : '.movie-item, .short-item, .th-item';
        var cards = list(doc.querySelectorAll(selector)).map(function (item) {
            var a = item.querySelector('.movie-title a, a.short-img, .th-in > a, a[href$=".html"], a');
            if (!a) return null;
            var url;
            try { url = safeUrl(a.getAttribute('href'), base); if (new URL(url).hostname !== own) return null; }
            catch (e) { return null; }
            var title = text(item.querySelector('.movie-title, .th-title, .short-title, .movie-title a')) || attr(item.querySelector('img'), ['alt']);
            if (!title) return null;
            var img = item.querySelector('img'), poster = '';
            try { if (img) poster = safeUrl(attr(img, ['data-src', 'data-original', 'src']), base); } catch (e) {}
            return { provider: id, title: title.slice(0, 250), url: url, poster: poster,
                original: text(item.querySelector('.th-title-oname, .movie-title-en')), info: text(item.querySelector('.short-label, .movie-year')) };
        }).filter(Boolean);
        if (!cards.length) {
            if (/нічого не знайдено|ничего не найдено|пошук не дав результатів/i.test(text(doc.body))) return [];
            throw failure('FORMAT', 'Каталог порожній або сайт змінив розмітку.');
        }
        return unique(cards, 'url').slice(0, 60);
    }
    function mediaUrl(value, base) {
        var url = safeUrl(value, base), parsed = new URL(url);
        var teleportalHls = parsed.hostname === 'vcms-api2.starlight.digital' && parsed.pathname === '/hls/multi';
        if (!/\.(?:m3u8|mp4|webm)$/i.test(parsed.pathname) && !teleportalHls) throw failure('STREAM', 'Це сторінка плеєра, а не відеопотік.');
        return url;
    }
    function qualities(value, title, base) {
        var source = String(value || ''), out = [], m;
        var re = /(?:\[([^\]]{1,30})\])?((?:https?:)?\/\/[^\s,"'<>]+\.(?:m3u8|mp4|webm)(?:\?[^\s,"'<>]*)?)/gi;
        while ((m = re.exec(source)) && out.length < 12) {
            try { out.push({ kind: 'stream', title: (title || 'Дивитися') + (m[1] ? ' · ' + m[1] : ''), url: mediaUrl(m[2], base) }); } catch (e) {}
        }
        return unique(out, 'url');
    }
    function flatten(value, base, prefix, out, depth) {
        out = out || []; depth = depth || 0;
        if (depth > 12 || out.length >= 300) return out;
        if (typeof value === 'string') {
            var trim = value.trim();
            if (trim[0] === '[' || trim[0] === '{') { try { return flatten(JSON.parse(trim), base, prefix, out, depth + 1); } catch (e) {} }
            var streams = qualities(trim, prefix, base);
            if (streams.length) return out.concat(streams).slice(0, 300);
            try {
                if (/^(?:https:)?\/\//.test(trim)) out.push({ kind: 'page', title: prefix || 'Відкрити плеєр', url: safeUrl(trim, base) });
            } catch (e) {}
            return out;
        }
        if (Array.isArray(value)) {
            value.slice(0, 300).forEach(function (v) { out = flatten(v, base, prefix, out, depth + 1); });
        } else if (value && typeof value === 'object') {
            var title = String(value.title || value.name || '').replace(/<[^>]+>/g, '').trim();
            var joined = [prefix, title].filter(Boolean).join(' · ');
            if (value.folder) out = flatten(value.folder, base, joined, out, depth + 1);
            else if (value.file || value.url) out = flatten(value.file || value.url, base, joined, out, depth + 1);
        }
        return out.slice(0, 300);
    }
    // Read only JSON and quoted literals. Downloaded JavaScript is never executed.
    function literalAt(source, start) {
        while (/\s/.test(source[start] || '') && start < source.length) start++;
        var first = source[start], end = start, quoted = first === '"' || first === "'", quote = '', escaped = false, depth = 0;
        if (!quoted && first !== '[' && first !== '{') return null;
        if (quoted) {
            for (end = start + 1; end < source.length && end - start < 600000; end++) {
                var c = source[end];
                if (!escaped && c === first) {
                    var raw = source.slice(start, end + 1);
                    if (first === '"') { try { return JSON.parse(raw); } catch (e) { return null; } }
                    return raw.slice(1, -1).replace(/\\u([0-9a-f]{4})|\\x([0-9a-f]{2})|\\([\\/'"])/gi,
                        function (_, u, x, simple) { return u || x ? String.fromCharCode(parseInt(u || x, 16)) : simple; });
                }
                escaped = !escaped && c === '\\';
            }
            return null;
        }
        for (end = start; end < source.length && end - start < 600000; end++) {
            var ch = source[end];
            if (quote) { if (!escaped && ch === quote) quote = ''; escaped = !escaped && ch === '\\'; continue; }
            if (ch === '"' || ch === "'") { quote = ch; continue; }
            if (ch === '[' || ch === '{') depth++;
            if (ch === ']' || ch === '}') { depth--; if (!depth) { try { return JSON.parse(source.slice(start, end + 1)); } catch (e) { return null; } } }
        }
        return null;
    }
    function detail(id, html, base, Parser) {
        var doc = parseDocument(html, Parser), out = [], skipped = 0;
        list(doc.querySelectorAll('video[src], source[src], .playlists-videos [data-file], .playlist [data-file]')).forEach(function (node) {
            var value = attr(node, ['data-file', 'src']);
            out = flatten(value, base, text(node) || attr(node, ['data-name', 'data-voice']), out);
        });
        if (id === 'uakino') {
            var ajax = doc.querySelector('.playlists-ajax, [data-playlist-url]');
            if (ajax) {
                var news = attr(ajax, ['data-news_id']) || ((new URL(base).pathname.match(/\/(\d+)-/) || [])[1]);
                if (news && /^\d+$/.test(news)) {
                    var playlist = new URL(safeUrl(attr(ajax, ['data-playlist-url']) || '/engine/ajax/playlists.php', base));
                    if (playlist.origin === new URL(base).origin) {
                        playlist.searchParams.set('news_id', news);
                        playlist.searchParams.set('xfield', attr(ajax, ['data-xfname']) || 'playlist');
                        var time = String(html).match(/dle_edittime\s*=\s*['"](\d{1,20})['"]/);
                        if (time) playlist.searchParams.set('time', time[1]);
                        out.push({ kind: 'page', title: 'Серії та озвучення', url: playlist.href });
                    }
                }
            }
        }
        list(doc.querySelectorAll('iframe[src], iframe[data-src]')).forEach(function (node) {
            try { var url = permitted(safeUrl(attr(node, ['data-src', 'src']), base), id); out.push({ kind: 'page', title: attr(node, ['title', 'data-name']) || 'Озвучення / відеоплеєр', url: url }); }
            catch (e) { skipped++; }
        });
        list(doc.querySelectorAll('script')).forEach(function (script) {
            var code = script.textContent || '', re = /(?:["']?(?:file|playlist)["']?)\s*[:=]\s*/g, m;
            while ((m = re.exec(code))) {
                var value = literalAt(code, re.lastIndex);
                if (value !== null) out = flatten(value, base, '', out);
                if (out.length >= 300) break;
            }
        });
        out = unique(out, 'url').filter(function (item) {
            try { item.url = item.kind === 'stream' ? mediaUrl(item.url) : permitted(item.url, id); return true; } catch (e) { return false; }
        });
        if (!out.length) throw failure(skipped ? 'PLAYER' : 'FORMAT', skipped ? 'Вбудований плеєр цього матеріалу ще не підтримується.' : 'Не знайдено відкритого відеопотоку або підтримуваного плеєра.');
        return out.slice(0, 300);
    }
    function tpPath(parts) {
        return parts.map(function (part) {
            var s = String(part || ''); if (!s || !/^[a-zA-Z0-9_-]+$/.test(s)) throw failure('FORMAT', 'Некоректний ідентифікатор Teleportal.');
            return encodeURIComponent(s);
        }).join('/');
    }
    function boundedArray(value, limit) {
        if (value == null) return [];
        if (!Array.isArray(value)) throw failure('FORMAT', 'Teleportal повернув інший формат списку.');
        return value.slice(0, limit);
    }
    function tpSearch(payload) {
        if (!Array.isArray(payload)) throw failure('FORMAT', 'Teleportal повернув інший формат пошуку.');
        return payload.slice(0, 60).map(function (item) {
            if (!item || !item.title || !item.typeSlug || !item.channelSlug || !item.projectSlug) return null;
            var url = provider('teleportal').api + 'ua/' + tpPath([item.typeSlug, item.channelSlug, item.projectSlug]);
            var poster = ''; try { if (item.image) poster = safeUrl(item.image, provider('teleportal').api); } catch (e) {}
            return { provider: 'teleportal', title: String(item.title).slice(0, 250), url: url, poster: poster, info: String(item.channelTitle || item.channelSlug).slice(0, 250) };
        }).filter(Boolean);
    }
    function tpProject(payload, url) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw failure('FORMAT', 'Teleportal повернув інший формат проєкту.');
        var out = [], seasons = Object.create(null);
        function episode(item, prefix) {
            if (!item || !item.hash || out.length >= 300) return;
            tpPlayerUrl(item.hash);
            out.push({ kind: 'tp-stream', title: [prefix, item.title || item.seriesTitle || 'Дивитися'].filter(Boolean).join(' · ').slice(0, 500), hash: String(item.hash), url: url + '#' + String(item.hash) });
        }
        boundedArray(payload.seasonsGallery, 100).forEach(function (season) {
            if (!season || typeof season !== 'object') return;
            seasons[season.seasonSlug] = true;
            if (Array.isArray(season.items) && season.items.length) boundedArray(season.items, 300).forEach(function (e) { episode(e, season.title); });
            else if (season.seasonSlug) out.push({ kind: 'tp-project', title: season.title || season.seasonSlug, url: url.replace(/\/$/, '') + '/' + tpPath([season.seasonSlug]) });
        });
        boundedArray(payload.seasons, 100).forEach(function (season) {
            if (!season || typeof season !== 'object') return;
            if (!seasons[season.seasonSlug] && season.seasonSlug) out.push({ kind: 'tp-project', title: season.title || season.seasonSlug, url: url.replace(/\/$/, '') + '/' + tpPath([season.seasonSlug]) });
        });
        boundedArray(payload.items, 300).forEach(function (e) { episode(e, ''); });
        if (!out.length && payload.hash) episode(payload, '');
        if (!out.length) throw failure('FORMAT', 'У цьому проєкті не знайдено доступних сезонів чи серій.');
        return unique(out, 'url').slice(0, 300);
    }
    function tpPlayerUrl(hash) {
        if (!/^[a-zA-Z0-9_-]{3,300}$/.test(String(hash || ''))) throw failure('FORMAT', 'Некоректний ідентифікатор відео.');
        return 'https://vcms-api2.starlight.digital/player-api/' + encodeURIComponent(hash) + '?referer=' + encodeURIComponent(provider('teleportal').home) + '&lang=ua';
    }
    function tpStreams(payload) {
        var out = [];
        function add(value, title) {
            if (!value) return;
            try { out.push({ kind: 'stream', title: String(title || 'Дивитися').slice(0, 250), url: mediaUrl(value) }); }
            catch (e) { out = out.concat(qualities(value, title)); }
        }
        boundedArray(payload && payload.video, 100).forEach(function (video) {
            if (!video || typeof video !== 'object') return;
            add(video.mediaHlsNoAdv, payload.name || 'Дивитися');
            boundedArray(video.media, 30).forEach(function (m) {
                if (m && typeof m === 'object') add(m.url, m.quality && m.quality !== 'auto' ? m.quality : payload.name || 'Дивитися');
            });
            add(video.mediaHls, payload.name || 'Дивитися');
        });
        if (!out.length) throw failure('STREAM', 'Teleportal не повернув доступного відеопотоку. Можливе обмеження доступу.');
        return unique(out, 'url').slice(0, 300);
    }
    function networkError(status) {
        status = Number(status) || 0;
        if (status === 401) return failure('AUTH', 'Джерело вимагає входу на своєму сайті.');
        if (status === 403 || status === 451) return failure('BLOCKED', 'Джерело відхилило доступ. Перевірте його відкриття у браузері проєктора.');
        if (status === 429) return failure('LIMIT', 'Забагато запитів до джерела. Спробуйте пізніше.');
        return failure('NETWORK', 'Не вдалося завантажити дані джерела.');
    }
    return { providers: providers, provider: provider, safeUrl: safeUrl, permitted: permitted, catalogUrl: catalogUrl,
        catalog: catalog, detail: detail, mediaUrl: mediaUrl, qualities: qualities, flatten: flatten,
        tpSearch: tpSearch, tpProject: tpProject, tpPlayerUrl: tpPlayerUrl, tpStreams: tpStreams,
        failure: failure, networkError: networkError };
}));

/* Ukrainian Sources — Lampa adapter. Keeps all account data outside this plugin. */
(function (window) {
    'use strict';
    var Core = window.UA3Core, KEY = 'ua_three_sources', TITLE = 'Українські джерела';
    function boot() {
        var L = window.Lampa;
        if (!L || !Core || window.ua_three_sources_ready) return;
        window.ua_three_sources_ready = true;
        var $ = window.jQuery || window.$;
        function jq(node) { return $ ? $(node) : node; }
        function element(tag, cls, value) {
            var node = document.createElement(tag); node.className = cls || '';
            if (value != null) node.textContent = value;
            return node;
        }
        function enter(node, callback) {
            var lock = false;
            function call(e) {
                if (lock) return;
                if (e && e.type === 'keydown' && e.key !== 'Enter') return;
                lock = true; setTimeout(function () { lock = false; }, 350); callback();
            }
            if ($) $(node).on('hover:enter', call);
            else {
                node.addEventListener('hover:enter', call);
            }
            // Lampa owns the remote's key events. DOM focus may still belong to
            // an older row after its virtual focus moved to another item.
            node.addEventListener('click', call);
            node.ua3Activate = call;
        }
        function push(params) { L.Activity.push(Object.assign({ component: KEY, title: TITLE }, params)); }
        var style = element('style');
        style.textContent = '.ua3-page{padding:1.6em 2em 3em}.ua3-title{font-size:1.5em;margin-bottom:.7em}.ua3-note{opacity:.72;line-height:1.45;margin:.7em 0 1em;white-space:pre-wrap}.ua3-row{display:block;padding:.9em 1em;margin:.45em 0;border-radius:.45em;background:rgba(255,255,255,.07);cursor:pointer;outline:none}.ua3-row.focus,.ua3-row:focus{background:rgba(255,255,255,.22)}.ua3-row-title{font-size:1.1em}.ua3-row-info{font-size:.83em;opacity:.7;margin-top:.3em}.ua3-poster{width:3em;height:4.2em;object-fit:cover;float:left;margin-right:1em;border-radius:.2em}.ua3-card{min-height:5.2em}.ua3-clear{clear:both}';
        document.head.appendChild(style);
        function Component(params) {
            params = params || {};
            var owner = this, scroll = null, page = null, content = null, lastFocus = null;
            var loaded = false, alive = true, active = false, generation = 0, pending = [], nets = [];
            function append(node) { content.appendChild(node); }
            function row(title, info, callback, poster) {
                var node = element('div', 'ua3-row selector' + (poster ? ' ua3-card' : '')); node.tabIndex = 0;
                if (poster) {
                    var img = element('img', 'ua3-poster'); img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.src = poster; node.appendChild(img);
                }
                node.appendChild(element('div', 'ua3-row-title', title));
                if (info) node.appendChild(element('div', 'ua3-row-info', info));
                if (poster) node.appendChild(element('div', 'ua3-clear'));
                enter(node, callback);
                if ($) $(node).on('hover:focus', function () { lastFocus = node; if (scroll && scroll.update) scroll.update(jq(node), true); });
                append(node); return node;
            }
            function note(value) { append(element('div', 'ua3-note', value)); }
            function title(value) { append(element('div', 'ua3-title', value)); }
            function busy(value) { if (owner.activity && owner.activity.loader) owner.activity.loader(value); }
            function focus() {
                if (!alive || !active || !L.Controller) return;
                var render = scroll ? scroll.render() : jq(page);
                if (L.Layer && L.Layer.update) L.Layer.update(render);
                L.Controller.collectionSet(render);
                L.Controller.collectionFocus(lastFocus || false, render);
            }
            // Lampa's internal Navigator is not exported in every web build.
            // These screens have a single column, so use the public focus API.
            function moveRow(delta) {
                if (!content || !alive) return false;
                var rows = Array.prototype.slice.call(content.querySelectorAll('.ua3-row'));
                if (!rows.length) return false;
                var index = lastFocus ? rows.indexOf(lastFocus) : 0;
                if (index < 0) index = 0;
                var next = index + delta;
                if (next < 0 || next >= rows.length) return false;
                lastFocus = rows[next];
                L.Controller.collectionFocus(lastFocus, scroll ? scroll.render() : jq(page));
                if (scroll && scroll.update) scroll.update(jq(lastFocus), true);
                return true;
            }
            function report(error, source) {
                var message = (source ? source + ': ' : '') + (error && error.message || 'Невідома помилка джерела.');
                note(message);
                if (error && error.code) note('Статус: ' + error.code);
            }
            function request(url, id) {
                var target = Core.permitted(url, id);
                return new Promise(function (resolve, reject) {
                    var settled = false, network = null;
                    function finish(error, value) {
                        if (settled) return; settled = true; clearTimeout(timer);
                        if (network) { var ni = nets.indexOf(network); if (ni >= 0) nets.splice(ni, 1); }
                        var index = pending.indexOf(cancel); if (index >= 0) pending.splice(index, 1);
                        if (error) reject(error); else resolve(value);
                    }
                    function cancel() { finish(Core.failure('CANCELLED', 'Запит скасовано.')); }
                    pending.push(cancel);
                    var timer = setTimeout(function () {
                        finish(Core.failure('TIMEOUT', 'Джерело не відповіло вчасно.'));
                        if (network && network.clear) network.clear();
                    }, 35000);
                    function success(response) {
                        try {
                            var status = Number(response && response.status) || 200;
                            if (status >= 400) return finish(Core.networkError(status));
                            var body = response && typeof response.responseText === 'string' ? response.responseText : response;
                            if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) body = body.data;
                            if (typeof body !== 'string') body = JSON.stringify(body);
                            if (!body || body.length > 2500000) return finish(Core.failure('FORMAT', 'Порожня або завелика відповідь джерела.'));
                            finish(null, body);
                        } catch (e) { finish(e); }
                    }
                    function failure(error) { finish(Core.networkError(error && (error.status || error.statusCode))); }
                    try {
                        if (typeof L.Reguest !== 'function') return finish(Core.failure('PLATFORM', 'Потрібна Lampa з підтримкою мережевих запитів.'));
                        network = new L.Reguest(); nets.push(network);
                        network.native(target, success, failure, false, { dataType: 'text', timeout: 30000, withCredentials: false });
                    } catch (e) { finish(Core.failure('NETWORK', 'Не вдалося виконати запит до джерела.')); }
                });
            }
            function json(body) {
                try { return JSON.parse(body); } catch (e) { throw Core.failure('FORMAT', 'Замість даних джерело повернуло іншу сторінку.'); }
            }
            function prepareHtml(body) {
                var trim = String(body).trim();
                if (trim[0] === '{') { var value = json(body); if (value.success === false) throw Core.failure('BLOCKED', 'Сайт відхилив запит списку серій.'); if (typeof value.response === 'string') return value.response; }
                return body;
            }
            function search(id) {
                if (!L.Input || typeof L.Input.edit !== 'function') return note('У цій версії Lampa не знайдено екран пошуку.');
                L.Input.edit({ title: 'Пошук українською', value: params.query || '', free: true, nosave: true }, function (value) {
                    var query = String(value || '').trim();
                    if (query) push({ mode: id ? 'catalog' : 'search', provider: id, query: query, page: 1, title: 'Пошук: ' + query });
                    else focus();
                });
            }
            function showCard(card) {
                row(card.title, card.info || card.original || Core.provider(card.provider).name, function () {
                    push({ mode: 'detail', provider: card.provider, url: card.url, title: card.title, poster: card.poster });
                }, card.poster);
            }
            function showStreams(streams) {
                if (!Array.isArray(streams) || !streams.length) throw Core.failure('STREAM', 'Доступного відеопотоку немає.');
                streams.forEach(function (stream) {
                    row(stream.title || 'Дивитися', 'Відкрити у плеєрі Lampa', function () {
                        try {
                            var url = Core.mediaUrl(stream.url), playlist = streams.map(function (s) {
                                return { title: (params.title || '') + ' · ' + (s.title || ''), url: Core.mediaUrl(s.url), timeline: {} };
                            });
                            L.Player.play({ title: params.title || stream.title, url: url, poster: params.poster || '', timeline: {} });
                            if (L.Player.playlist) L.Player.playlist(playlist);
                        } catch (e) { if (L.Noty) L.Noty.show(e.message); }
                    });
                });
            }
            function showChoices(choices) {
                var streams = choices.filter(function (choice) { return choice.kind === 'stream'; });
                if (streams.length) showStreams(streams);
                choices.filter(function (choice) { return choice.kind !== 'stream'; }).forEach(function (choice) {
                    row(choice.title, choice.kind === 'tp-stream' ? 'Дивитися серію' : 'Відкрити список', function () {
                        push({ mode: choice.kind === 'tp-stream' ? 'tp-stream' : 'detail', provider: params.provider, url: choice.url,
                            hash: choice.hash, title: (params.title || '') + ' · ' + choice.title,
                            poster: params.poster, visited: (params.visited || []).concat(params.url).slice(-4) });
                    });
                });
            }
            function loadCatalog(id, query, pageNo) {
                var url = Core.catalogUrl(id, query, pageNo), p = Core.provider(id);
                if (!url) { note('У Teleportal почніть з назви шоу або серіалу.'); return Promise.resolve(); }
                return request(url, id).then(function (body) {
                    if (!alive) return;
                    var cards = id === 'teleportal' ? Core.tpSearch(json(body)) : Core.catalog(id, body, p.home);
                    if (!cards.length) note(p.name + ': нічого не знайдено.');
                    cards.forEach(showCard);
                    if (id !== 'teleportal' && cards.length) row('Наступна сторінка', p.name, function () { push({ mode: 'catalog', provider: id, query: query, page: pageNo + 1, title: p.name }); });
                });
            }
            function load() {
                var version = ++generation; loaded = true; busy(true); content.textContent = ''; lastFocus = null;
                title(params.title || TITLE);
                var operation;
                if (!params.mode) {
                    note('UASerials, UAKino та Teleportal. Доступність каталогу й відео залежить від сайту та вашої мережі.');
                    row('Пошук у трьох джерелах', 'Одночасний пошук фільмів, серіалів і шоу', function () { search(null); });
                    Core.providers.forEach(function (p) { row(p.name, p.id === 'teleportal' ? 'Пошук шоу, сезонів і серій' : 'Каталог і пошук', function () { push({ mode: 'catalog', provider: p.id, title: p.name, page: 1 }); }); });
                    note('Версія 0.1.2');
                    operation = Promise.resolve();
                } else if (params.mode === 'catalog') {
                    row('Пошук у ' + Core.provider(params.provider).name, params.query || 'Ввести назву', function () { search(params.provider); });
                    operation = loadCatalog(params.provider, params.query || '', Number(params.page) || 1);
                } else if (params.mode === 'search') {
                    operation = Promise.all(Core.providers.map(function (p) { return loadCatalog(p.id, params.query, 1).catch(function (e) { if (alive) report(e, p.name); }); }));
                } else if (params.mode === 'tp-stream') {
                    operation = request(Core.tpPlayerUrl(params.hash), 'teleportal').then(function (body) { if (alive) showStreams(Core.tpStreams(json(body))); });
                } else if (params.mode === 'detail') {
                    if ((params.visited || []).indexOf(params.url) >= 0 || (params.visited || []).length >= 4) {
                        operation = Promise.reject(Core.failure('PLAYER', 'Плеєр не надав прямий відеопотік. Повторні переходи зупинено.'));
                    } else {
                        operation = request(params.url, params.provider).then(function (body) {
                            if (!alive) return;
                            var choices = params.provider === 'teleportal' ? Core.tpProject(json(body), params.url) : Core.detail(params.provider, prepareHtml(body), params.url);
                            showChoices(choices);
                        });
                    }
                } else operation = Promise.reject(Core.failure('FORMAT', 'Цей екран недоступний.'));
                operation.catch(function (error) {
                    if (alive && version === generation) {
                        report(error);
                        row('Повторити', 'Ще раз звернутися до джерела', load);
                    }
                }).then(function () {
                    if (alive && version === generation) { busy(false); focus(); }
                });
            }
            this.create = function () {
                if (!page) {
                    scroll = typeof L.Scroll === 'function' ? new L.Scroll({ mask: true, over: true }) : null;
                    // Bound the viewport below Lampa's header; an auto-height
                    // scroll grows with the results and clamps every move to 0.
                    if (scroll && typeof scroll.minus === 'function') scroll.minus();
                    page = scroll ? scroll.render(true) : element('div');
                    content = element('div', 'ua3-page');
                    if (scroll) scroll.append(jq(content)); else page.appendChild(content);
                }
                if (!loaded) load();
                return scroll ? scroll.render() : jq(page);
            };
            this.render = this.create;
            this.initialize = function () { this.create(); this.start(); };
            this.start = function () {
                active = true; this.create();
                L.Controller.add('content', {
                    link: owner, toggle: focus,
                    enter: function () {
                        var node = lastFocus || (content && content.querySelector('.ua3-row'));
                        if (node && node.ua3Activate) node.ua3Activate();
                    },
                    up: function () { if (!moveRow(-1)) L.Controller.toggle('head'); },
                    down: function () { moveRow(1); },
                    left: function () { L.Controller.toggle('menu'); },
                    right: function () { focus(); },
                    back: function () { L.Activity.backward(); }
                });
                L.Controller.toggle('content');
            };
            this.pause = this.stop = function () { active = false; };
            this.destroy = function () {
                alive = false; generation++;
                var activeNetworks = nets.slice();
                pending.slice().forEach(function (cancel) { cancel(); });
                activeNetworks.forEach(function (network) { if (network.clear) network.clear(); });
                if (scroll) scroll.destroy();
                else if (page && page.parentNode) page.parentNode.removeChild(page);
                page = content = scroll = null;
            };
        }
        L.Component.add(KEY, Component);
        var open = function () { push({}); };
        if (L.Menu && typeof L.Menu.addButton === 'function') L.Menu.addButton('', TITLE, open);
        else if ($) {
            var menu = $('<li class="menu__item selector"><div class="menu__ico">UA</div><div class="menu__text"></div></li>');
            menu.find('.menu__text').text(TITLE); menu.on('hover:enter', open); $('.menu .menu__list').eq(0).append(menu);
        }
        // Optional card action searches all three sources, without replacing Lampa's home page.
        if (L.Listener) L.Listener.follow('full', function (event) {
            if (event.type !== 'complite' || !event.data || !$) return;
            var card = event.data.movie || event.data, render = event.object && event.object.activity && event.object.activity.render && event.object.activity.render();
            if (!render || !card || !(card.title || card.name)) return;
            var buttons = $(render).find('.full-start__buttons');
            if (!buttons.length || buttons.find('.ua3-watch').length) return;
            var button = $('<div class="full-start__button selector ua3-watch"><span>Українські джерела</span></div>');
            button.on('hover:enter', function () { push({ mode: 'search', query: card.title || card.name, title: card.title || card.name }); }); buttons.append(button);
        });
    }
    if (window.appready) boot();
    else if (window.Lampa && window.Lampa.Listener) window.Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') boot(); });
    else document.addEventListener('lampa', boot, { once: true });
}(window));
