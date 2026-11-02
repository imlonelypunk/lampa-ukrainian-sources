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
