(function () {
    'use strict';

    var list = document.getElementById('newsletter-list');
    var status = document.getElementById('newsletter-status');
    var search = document.getElementById('newsletter-search');
    var language = document.getElementById('newsletter-language');
    var source = document.getElementById('newsletter-source');
    var sourceStrip = document.getElementById('newsletter-source-strip');
    var itemCount = document.getElementById('newsletter-item-count');
    var feedCount = document.getElementById('newsletter-feed-count');
    var updatedAt = document.getElementById('newsletter-updated-at');
    var snapshot = { feeds: [], items: [] };

    function formatDate(value, includeTime) {
        if (!value) return '날짜 미상';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return value.slice(0, 10);
        return new Intl.DateTimeFormat('ko-KR', includeTime ? {
            timeZone: 'Asia/Seoul',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        } : {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }).format(date);
    }

    function appendText(parent, tag, className, text) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = text || '';
        parent.appendChild(element);
        return element;
    }

    function renderSources() {
        source.textContent = '';
        var allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = '전체 발행처';
        source.appendChild(allOption);
        sourceStrip.textContent = '';

        snapshot.feeds.forEach(function (feed) {
            var option = document.createElement('option');
            option.value = feed.id || '';
            option.textContent = feed.title || feed.id || '알 수 없는 발행처';
            source.appendChild(option);

            var chip = appendText(sourceStrip, 'span', 'newsletter-source-chip', option.textContent);
            chip.dataset.error = feed.error ? 'true' : 'false';
            if (feed.error) chip.title = feed.error;
        });
    }

    function cardFor(item) {
        var card = document.createElement('a');
        card.className = 'newsletter-card';
        card.href = item.url;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        if (item.language === 'ko' || item.language === 'en') card.lang = item.language;

        var top = document.createElement('div');
        top.className = 'newsletter-card-top';
        appendText(top, 'span', 'newsletter-card-source', item.source || '뉴스레터');
        appendText(top, 'span', 'newsletter-card-category', item.category || '기타');
        card.appendChild(top);

        appendText(card, 'h3', '', item.title || '제목 없음');
        if (item.summary) appendText(card, 'p', 'newsletter-card-summary', item.summary);

        var footer = document.createElement('div');
        footer.className = 'newsletter-card-footer';
        appendText(footer, 'time', '', formatDate(item.publishedAt || item.collectedAt, false));
        appendText(footer, 'span', 'newsletter-open-label', '원문 보기 ↗');
        card.appendChild(footer);
        return card;
    }

    function renderItems() {
        var query = (search.value || '').trim().toLocaleLowerCase('ko-KR');
        var selectedLanguage = language.value || '';
        var selectedSource = source.value || '';
        var items = snapshot.items.filter(function (item) {
            if (selectedSource && item.feedId !== selectedSource) return false;
            if ((selectedLanguage === 'ko' || selectedLanguage === 'en') && item.language !== selectedLanguage) return false;
            if (!query) return true;
            return [item.title, item.summary, item.source, item.category]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase('ko-KR')
                .includes(query);
        });

        if (selectedLanguage === 'ko-first') {
            items.sort(function (left, right) {
                var leftRank = left.language === 'ko' ? 0 : (left.language === 'en' ? 1 : 2);
                var rightRank = right.language === 'ko' ? 0 : (right.language === 'en' ? 1 : 2);
                return leftRank - rightRank;
            });
        }

        list.textContent = '';
        if (!items.length) {
            appendText(list, 'p', 'newsletter-empty', '조건에 맞는 뉴스레터 글이 없습니다.');
        } else {
            items.forEach(function (item) { list.appendChild(cardFor(item)); });
        }
        var modeLabel = selectedLanguage === 'ko-first' ? '한국어 우선 · ' : '';
        status.textContent = modeLabel + '전체 ' + snapshot.items.length + '개 중 ' + items.length + '개를 표시합니다.';
    }

    function render(snapshotData) {
        snapshot = {
            feeds: Array.isArray(snapshotData.feeds) ? snapshotData.feeds : [],
            items: Array.isArray(snapshotData.items) ? snapshotData.items : []
        };
        itemCount.textContent = String(snapshot.items.length);
        feedCount.textContent = String(snapshot.feeds.length);
        updatedAt.textContent = formatDate(snapshotData.generatedAt, true);
        renderSources();
        renderItems();
    }

    search.addEventListener('input', renderItems);
    language.addEventListener('change', renderItems);
    source.addEventListener('change', renderItems);

    fetch('./newsletters.json', { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(render)
        .catch(function () {
            status.textContent = '뉴스레터 목록을 불러오지 못했습니다.';
            list.textContent = '';
            appendText(list, 'p', 'newsletter-error', '잠시 후 다시 시도해 주세요. 기존 블로그 글에는 영향이 없습니다.');
        });
}());
