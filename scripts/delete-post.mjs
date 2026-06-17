#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const siteBase = 'https://viddigest-blog.pages.dev';
const slug = process.argv[2];

if (!slug || slug.includes('/') || slug.includes('\\') || slug === '.' || slug === '..') {
  console.error('Usage: node scripts/delete-post.mjs <post-slug>');
  process.exit(2);
}

const root = process.cwd();
const publicDir = path.join(root, 'public');
const postsJsonPath = path.join(publicDir, 'posts.json');
const indexPath = path.join(publicDir, 'index.html');
const sitemapPath = path.join(publicDir, 'sitemap.xml');
const postDir = path.join(publicDir, 'posts', slug);
const postHref = `${siteBase}/posts/${slug}/`;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatPostsJson(posts) {
  return `${JSON.stringify(posts, null, 2).replace(/\//g, '\\/').replace(/^(\s*)"([^"]+)":/gm, '$1"$2" :')}\n`;
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function writeTextIfChanged(filePath, value) {
  let previous = null;
  try {
    previous = await readText(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous !== value) {
    await fs.writeFile(filePath, value);
  }
}

function removeAnchorByClass(html, href, className) {
  const pattern = new RegExp(
    `\\s*<a\\s+href="${escapeRegExp(href)}"\\s+class="${escapeRegExp(className)}"[^>]*>[\\s\\S]*?<\\/a>`,
    'g'
  );
  return html.replace(pattern, '');
}

function removeDeletedPostLinks(html, href) {
  let next = html;
  next = removeAnchorByClass(next, href, 'series-link');
  next = removeAnchorByClass(next, href, 'series-link current');
  next = removeAnchorByClass(next, href, 'adjacent-card');
  return next;
}

function stripSeriesNotice(html) {
  return html
    .replace(/\s*<aside class="series-notice">[\s\S]*?<\/aside>/, '')
    .replace(/<blockquote><p>이 글은 전체 \d+편 중 \d+편입니다\. 긴 영상을 주제 흐름에 맞춰 나누어 정리했습니다\.<\/p><\/blockquote>\n?/, '')
    .replace(/<strong>이 글은 전체 \d+편 중 \d+편입니다\.<\/strong>/g, '')
    .replace(/이 글은 전체 \d+편 중 \d+편입니다\. 현재 글은 [^<]+?의 제공된 세그먼트만 다룹니다\./g, '이 글은 제공된 영상 내용을 기준으로 정리했습니다.');
}

function replaceAllLiteral(value, from, to) {
  if (!from || from === to) return value;
  return value.split(from).join(to);
}

function replaceSurvivorCardExcerpt(html, survivorSlug, oldExcerpt, nextExcerpt) {
  if (!oldExcerpt || oldExcerpt === nextExcerpt) return html;
  const href = `${siteBase}/posts/${survivorSlug}/`;
  const pattern = new RegExp(`(<a\\s+href="${escapeRegExp(href)}"\\s+class="post-card"[^>]*>[\\s\\S]*?<\\/a>)`);
  return html.replace(pattern, (card) => (
    replaceAllLiteral(
      replaceAllLiteral(card, oldExcerpt, nextExcerpt),
      escapeHtml(oldExcerpt),
      escapeHtml(nextExcerpt)
    )
  ));
}

function queryEncodedTitle(value) {
  return encodeURIComponent(value).replace(/%2F/g, '/');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function listPostHtmlFiles() {
  const postsRoot = path.join(publicDir, 'posts');
  const entries = await fs.readdir(postsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(postsRoot, entry.name, 'index.html'));
}

function isMarkdownPost(post) {
  const tags = Array.isArray(post.tags) ? post.tags : [];
  if (tags.includes('마크다운')) return true;
  return !String(post.videoId || '').trim()
    && !String(post.channel || '').trim()
    && !String(post.duration || '').trim();
}

function absoluteUrl(post) {
  return `${siteBase}${isMarkdownPost(post) ? '/md/' : '/posts/'}${post.slug}/`;
}

function generateSitemap(posts) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n    <url>\n        <loc>${siteBase}/</loc>\n        <changefreq>daily</changefreq>\n        <priority>1.0</priority>\n    </url>\n`;

  for (const post of posts) {
    const lastmod = post.updatedDate || String(post.slug || '').slice(0, 10);
    xml += `    <url>\n        <loc>${absoluteUrl(post)}</loc>\n        <lastmod>${lastmod}</lastmod>\n        <changefreq>monthly</changefreq>\n        <priority>0.8</priority>\n    </url>\n`;
  }

  xml += '</urlset>';
  return xml;
}

async function main() {
  const posts = JSON.parse(await readText(postsJsonPath));
  const removedPost = posts.find((post) => post.slug === slug);

  if (!removedPost) {
    throw new Error(`Post not found in public/posts.json: ${slug}`);
  }

  const remainingPosts = posts.filter((post) => post.slug !== slug);
  const titleRewrites = [];

  if (removedPost.seriesBaseTitle && removedPost.seriesPartCount) {
    const seriesSiblings = remainingPosts.filter((post) => (
      post.videoId === removedPost.videoId
      && post.seriesBaseTitle === removedPost.seriesBaseTitle
      && post.seriesPartCount === removedPost.seriesPartCount
    ));

    if (seriesSiblings.length === 1) {
      const survivor = seriesSiblings[0];
      const oldTitle = survivor.title;
      const nextTitle = survivor.seriesBaseTitle || oldTitle.replace(/\s+\d+\/\d+$/, '');
      const oldExcerpt = survivor.excerpt || '';
      const nextExcerpt = '> 이 글은 제공된 영상 내용을 기준으로 정리했습니다.';
      survivor.title = nextTitle;
      survivor.excerpt = nextExcerpt;
      delete survivor.seriesBaseTitle;
      delete survivor.seriesPartCount;
      delete survivor.seriesPartIndex;
      titleRewrites.push({ slug: survivor.slug, oldTitle, nextTitle, oldExcerpt, nextExcerpt });
    }
  }

  await writeTextIfChanged(postsJsonPath, formatPostsJson(remainingPosts));
  await fs.rm(postDir, { recursive: true, force: true });

  let indexHtml = await readText(indexPath);
  indexHtml = removeAnchorByClass(indexHtml, postHref, 'mini-post');
  indexHtml = removeAnchorByClass(indexHtml, postHref, 'post-card');
  const blogPostCount = remainingPosts.filter((post) => !isMarkdownPost(post)).length;
  indexHtml = indexHtml.replace(/(<strong id="home-blog-count">)\d+(<\/strong>)/, `$1${blogPostCount}$2`);
  for (const rewrite of titleRewrites) {
    indexHtml = replaceAllLiteral(indexHtml, rewrite.oldTitle, rewrite.nextTitle);
    indexHtml = replaceSurvivorCardExcerpt(indexHtml, rewrite.slug, rewrite.oldExcerpt, rewrite.nextExcerpt);
  }
  await writeTextIfChanged(indexPath, indexHtml);

  await writeTextIfChanged(sitemapPath, generateSitemap(remainingPosts));

  for (const htmlFile of await listPostHtmlFiles()) {
    let html;
    try {
      html = await readText(htmlFile);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }

    let next = removeDeletedPostLinks(html, postHref);
    for (const rewrite of titleRewrites) {
      if (htmlFile.endsWith(path.join(rewrite.slug, 'index.html'))) {
        next = stripSeriesNotice(next);
        next = replaceAllLiteral(next, rewrite.oldExcerpt, rewrite.nextExcerpt);
        next = replaceAllLiteral(next, escapeHtml(rewrite.oldExcerpt), escapeHtml(rewrite.nextExcerpt));
      }
      next = replaceAllLiteral(next, rewrite.oldTitle, rewrite.nextTitle);
      next = replaceAllLiteral(next, queryEncodedTitle(rewrite.oldTitle), queryEncodedTitle(rewrite.nextTitle));
    }
    await writeTextIfChanged(htmlFile, next);
  }

  console.log(`Deleted post: ${slug}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
