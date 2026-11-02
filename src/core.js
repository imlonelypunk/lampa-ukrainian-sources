/* Ukrainian Sources 0.1.1. No script evaluation, third-party proxies or credential storage. */
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
