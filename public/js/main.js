;(function () {
  'use strict'

  var PAGE_SIZE = 5

  // --------
  // Lightbox
  // --------
  document.querySelectorAll('.screenshot-container img').forEach(function (img) {
    img.addEventListener('click', function () {
      var lb = document.getElementById('lightbox')
      var lbImg = document.getElementById('lightbox-img')
      if (lb && lbImg) {
        lbImg.src = this.src
        lb.classList.add('active')
      }
    })
  })

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var lb = document.getElementById('lightbox')
      if (lb) lb.classList.remove('active')
    }
  })

  // --------------------------
  // Post detail: back to list
  // --------------------------
  var isPostPage = /\/posts\//.test(window.location.pathname)
  if (isPostPage) {
    var postContainer = document.querySelector('.container')
    if (postContainer && !document.querySelector('.vd-post-nav')) {
      var nav = document.createElement('div')
      nav.className = 'vd-post-nav'

      var btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'vd-back-button'
      btn.textContent = '← 목록으로'
      btn.addEventListener('click', function () {
        var listUrl = sessionStorage.getItem('vd:list:url')
        if (listUrl) {
          sessionStorage.setItem('vd:list:restore', '1')
          window.location.href = listUrl
          return
        }
        window.location.href = '../../'
      })

      nav.appendChild(btn)
      postContainer.insertBefore(nav, postContainer.firstChild)
    }
  }

  // ----------------------
  // Index: category + paging
  // ----------------------
  var postList = document.querySelector('.post-list')
  var allCards = Array.prototype.slice.call(
    document.querySelectorAll('.post-card')
  )
  var allTabs = Array.prototype.slice.call(
    document.querySelectorAll('.cat-tab')
  )

  if (!postList || allCards.length === 0) return

  var currentCat = '전체'
  var currentPage = 1

  function getQueryState() {
    var params = new URLSearchParams(window.location.search)
    var cat = params.get('cat') || params.get('category')
    var pageRaw = params.get('page') || '1'
    var page = parseInt(pageRaw, 10)
    if (!Number.isFinite(page) || page < 1) page = 1

    if (
      cat &&
      allTabs.some(function (t) {
        return t.getAttribute('data-category') === cat
      })
    ) {
      currentCat = cat
    }

    currentPage = page
  }

  function setActiveTab(cat) {
    allTabs.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-category') === cat)
    })
  }

  function filteredCards() {
    if (currentCat === '전체') return allCards
    return allCards.filter(function (card) {
      return card.getAttribute('data-category') === currentCat
    })
  }

  function buildListUrl(cat, page) {
    var params = new URLSearchParams()
    if (cat && cat !== '전체') params.set('cat', cat)
    if (page && page !== 1) params.set('page', String(page))
    var qs = params.toString()
    return qs ? window.location.pathname + '?' + qs : window.location.pathname
  }

  function updateUrl(push) {
    var url = buildListUrl(currentCat, currentPage)
    if (push) {
      window.history.pushState({ cat: currentCat, page: currentPage }, '', url)
      return
    }
    window.history.replaceState({ cat: currentCat, page: currentPage }, '', url)
  }

  function ensurePager() {
    var existing = document.querySelector('.vd-pagination')
    if (existing) return existing

    var pager = document.createElement('nav')
    pager.className = 'vd-pagination'
    pager.setAttribute('aria-label', 'Posts pagination')

    var footer = document.querySelector('.footer')
    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(pager, footer)
    } else {
      postList.parentNode.appendChild(pager)
    }

    pager.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a') : null
      if (!a || !pager.contains(a)) return
      if (a.classList.contains('is-disabled')) {
        e.preventDefault()
        return
      }

      var nextPage = parseInt(a.getAttribute('data-page') || '0', 10)
      if (!Number.isFinite(nextPage) || nextPage < 1) return
      if (nextPage === currentPage) {
        e.preventDefault()
        return
      }

      e.preventDefault()
      currentPage = nextPage
      render(true)
      scrollToListTop()
    })

    return pager
  }

  function pageModel(totalPages) {
    if (totalPages <= 7) {
      var all = []
      for (var i = 1; i <= totalPages; i++) all.push(i)
      return all
    }

    var model = [1]
    var left = Math.max(2, currentPage - 2)
    var right = Math.min(totalPages - 1, currentPage + 2)

    if (currentPage <= 4) {
      left = 2
      right = 5
    } else if (currentPage >= totalPages - 3) {
      left = totalPages - 4
      right = totalPages - 1
    }

    if (left > 2) model.push('...')
    for (var p = left; p <= right; p++) model.push(p)
    if (right < totalPages - 1) model.push('...')
    model.push(totalPages)
    return model
  }

  function pagerHtml(totalPages) {
    if (totalPages <= 1) return ''

    var parts = []
    var prev = Math.max(1, currentPage - 1)
    var next = Math.min(totalPages, currentPage + 1)

    parts.push(
      '<a class="vd-page is-prev ' +
        (currentPage === 1 ? 'is-disabled' : '') +
        '" href="' +
        buildListUrl(currentCat, prev) +
        '" data-page="' +
        prev +
        '">이전</a>'
    )

    pageModel(totalPages).forEach(function (item) {
      if (item === '...') {
        parts.push('<span class="vd-ellipsis">…</span>')
        return
      }
      var page = item
      parts.push(
        '<a class="vd-page ' +
          (page === currentPage ? 'is-active' : '') +
          '" href="' +
          buildListUrl(currentCat, page) +
          '" data-page="' +
          page +
          '">' +
          page +
          '</a>'
      )
    })

    parts.push(
      '<a class="vd-page is-next ' +
        (currentPage === totalPages ? 'is-disabled' : '') +
        '" href="' +
        buildListUrl(currentCat, next) +
        '" data-page="' +
        next +
        '">다음</a>'
    )

    return parts.join('')
  }

  function applyVisibility(filtered) {
    allCards.forEach(function (c) {
      c.style.display = 'none'
    })

    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    if (currentPage > totalPages) currentPage = totalPages
    if (currentPage < 1) currentPage = 1

    var start = (currentPage - 1) * PAGE_SIZE
    var end = start + PAGE_SIZE
    filtered.slice(start, end).forEach(function (c) {
      c.style.display = ''
    })

    return totalPages
  }

  function scrollToListTop() {
    var container = document.querySelector('.container')
    if (!container) return
    var y = container.getBoundingClientRect().top + window.scrollY - 10
    if (y < 0) y = 0
    window.scrollTo({ top: y, behavior: 'smooth' })
  }

  function maybeRestoreScroll() {
    var restore = sessionStorage.getItem('vd:list:restore')
    if (restore !== '1') return

    var yRaw = sessionStorage.getItem('vd:list:scrollY') || '0'
    var y = parseInt(yRaw, 10)
    if (!Number.isFinite(y) || y < 0) y = 0

    sessionStorage.setItem('vd:list:restore', '0')
    requestAnimationFrame(function () {
      window.scrollTo(0, y)
    })
  }

  function render(pushUrl) {
    setActiveTab(currentCat)
    var filtered = filteredCards()
    var totalPages = applyVisibility(filtered)

    var pager = ensurePager()
    pager.innerHTML = pagerHtml(totalPages)
    pager.style.display = totalPages <= 1 ? 'none' : ''

    updateUrl(!!pushUrl)
  }

  // Category click
  allTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var cat = this.getAttribute('data-category') || '전체'
      if (cat === currentCat) return
      currentCat = cat
      currentPage = 1
      render(true)
      scrollToListTop()
    })
  })

  // Store list state before navigating to a post
  function isModifiedClick(e) {
    return (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
  }

  allCards.forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (isModifiedClick(e)) return
      sessionStorage.setItem('vd:list:url', buildListUrl(currentCat, currentPage))
      sessionStorage.setItem('vd:list:scrollY', String(window.scrollY))
      sessionStorage.setItem('vd:list:restore', '0')
    })
  })

  window.addEventListener('popstate', function () {
    getQueryState()
    render(false)
  })

  getQueryState()
  render(false)
  maybeRestoreScroll()
})()
