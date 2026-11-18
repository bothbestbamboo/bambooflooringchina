import fs from 'fs';
import path from 'path';

const OLD_SITE_DIR = './old_html';

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach((f) => {
    const dirPath = path.join(dir, f);
    fs.statSync(dirPath).isDirectory() ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

function matchOne(str, regex, fallback = '') {
  const m = str.match(regex);
  return m ? m[1].trim() : fallback;
}

function cleanText(str) {
  return str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// 清理每行开头的缩进空格/Tab，防止 Markdown 将缩进的 HTML 误判为代码块
function cleanHtmlIndent(html) {
  return html.replace(/^[ \t]+/gm, '').trim();
}

if (!fs.existsSync(OLD_SITE_DIR)) {
  console.error('❌ 未找到 old_html 文件夹，请确认旧网站的 html 文件已放入 old_html 目录！');
  process.exit(1);
}

// 1. 先从 news_1.html ~ news_21.html 中提取每篇新闻的列表摘要 (summary)
const newsSummaries = {};
walkDir(path.join(OLD_SITE_DIR, 'news'), (filePath) => {
  const base = path.basename(filePath);
  if (/^news_\d+\.html$/i.test(base)) {
    const html = fs.readFileSync(filePath, 'utf-8');
    const postRegex = /<h3><a href=['"]\/news\/(news-detail-\d+)\.html['"]>[\s\S]*?<\/a><\/h3>[\s\S]*?<p class=['"]post-date['"]>([\s\S]*?)<\/p><\/div><div class=['"]span10['"]><p>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = postRegex.exec(html)) !== null) {
      newsSummaries[m[1]] = { date: m[2].trim(), summary: cleanText(m[3]) };
    }
  }
});

let prodCount = 0, newsCount = 0, catCount = 0, galCount = 0, rootProdCount = 0;

// 2. 遍历所有 HTML 提取纯数据
walkDir(OLD_SITE_DIR, (filePath) => {
  if (!filePath.endsWith('.html')) return;
  const relPath = path.relative(OLD_SITE_DIR, filePath).replace(/\\/g, '/');
  const slug = path.basename(filePath, '.html');
  const rawHtml = fs.readFileSync(filePath, 'utf-8').replace(/\/kindeditor\/asp\.net\/\.\.\//g, '/kindeditor/');

  const title = matchOne(rawHtml, /<title>([\s\S]*?)<\/title>/i, 'Bamboo Flooring: China Factory Wholesale');
  const keywords = matchOne(rawHtml, /<meta\s+name=['"]Keywords['"]\s+content=['"]([\s\S]*?)['"]/i, '');
  const description = matchOne(rawHtml, /<meta\s+name=['"]description['"]\s+content=['"]([\s\S]*?)['"]/i, '');
  const bodyClass = matchOne(rawHtml, /<body\s+class=['"]([\s\S]*?)['"]/i, '');

  // A. 处理新闻详情页 -> src/data/news/*.md
  if (relPath.startsWith('news/news-detail-')) {
    const id = parseInt(slug.replace('news-detail-', ''), 10) || 0;
    const date = matchOne(rawHtml, /Posted on\s*([^<]+)<\/p>/i, newsSummaries[slug]?.date || '');
    const summary = newsSummaries[slug]?.summary || description;
    const content = matchOne(rawHtml, /<!--post content-->[\s\S]*?<div class=['"]span12['"]>([\s\S]*?)<\/div><\/div><!--columns-->/i)
      || matchOne(rawHtml, /property=['"]content:encoded['"]>([\s\S]*?)<\/div><\/div><\/div><div class=['"]row-fluid post-pager/i);

    const md = `---
id: ${id}
slug: ${JSON.stringify(slug)}
title: ${JSON.stringify(title)}
keywords: ${JSON.stringify(keywords)}
description: ${JSON.stringify(description)}
date: ${JSON.stringify(date)}
summary: ${JSON.stringify(summary)}
---

${cleanHtmlIndent(content)}
`;
    fs.mkdirSync('./src/data/news', { recursive: true });
    fs.writeFileSync(`./src/data/news/${slug}.md`, md, 'utf-8');
    newsCount++;
  }

  // B. 处理产品详情页与分类页 -> src/data/products/*.md 或 src/data/categories/*.md
  else if (relPath.startsWith('products/')) {
    if (slug.startsWith('product-type-') || !rawHtml.includes('AttributeList')) {
      const mainBody = matchOne(rawHtml, /<\/header>\s*(?:<!--\s*\/?#header\s*-->)?([\s\S]*?)<footer/i);
      const md = `---
slug: ${JSON.stringify(slug)}
title: ${JSON.stringify(title)}
keywords: ${JSON.stringify(keywords)}
description: ${JSON.stringify(description)}
bodyClass: ${JSON.stringify(bodyClass)}
footerType: ${rawHtml.includes('class="postscript') ? '"postscript"' : '"simple"'}
---

${cleanHtmlIndent(mainBody)}
`;
      fs.mkdirSync('./src/data/categories', { recursive: true });
      fs.writeFileSync(`./src/data/categories/${slug}.md`, md, 'utf-8');
      catCount++;
    } else {
      const pageTitle = cleanText(matchOne(rawHtml, /<h1[^>]*id=['"]page-title['"][^>]*>([\s\S]*?)<\/h1>/i, title));
      const catMatch = rawHtml.match(/<ul class=["']breadcrumb["']>[\s\S]*?<li>\s*<a href=['"]([^'"]+)['"]>([\s\S]*?)<\/a>/i);
      const categoryUrl = catMatch ? catMatch[1] : '/products/product-type-BambooFlooring.html';
      const categoryName = catMatch ? cleanText(catMatch[2]) : 'Bamboo Flooring';
      const date = cleanText(matchOne(rawHtml, /<div class=['"]subtitle['"]>([\s\S]*?)<\/div>/i, ''));
      const summary = cleanText(matchOne(rawHtml, /<div class=['"]subtitle['"]>[\s\S]*?<\/div>\s*<p>([\s\S]*?)<\/p>/i, description));

      const images = [];
      const slideBlock = matchOne(rawHtml, /<div class=['"]peVolo slideWrap['"][^>]*>([\s\S]*?)<\/div><\/div><\/div><div class=['"]span3['"]>/i);
      const imgRegex = /<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi;
      let im;
      while ((im = imgRegex.exec(slideBlock)) !== null) {
        const alt = matchOne(im[0], /alt=['"]([^'"]*)['"]/i, pageTitle);
        images.push({ src: im[1], alt, title: alt });
      }

      const attributes = [];
      const attrBlock = matchOne(rawHtml, /<ul class=['"]unstyled AttributeList['"]>([\s\S]*?)<\/ul>/i);
      const liRegex = /<li>([\s\S]*?)<\/li>/gi;
      let lm;
      while ((lm = liRegex.exec(attrBlock)) !== null) {
        attributes.push(cleanText(lm[1]));
      }

      const descContent = matchOne(rawHtml, /<div class=['"]tab-pane active['"] id=['"]home['"]>([\s\S]*?)<\/div><\/div><\/div>\s*<div id=["']block-views/i);

      const md = `---
slug: ${JSON.stringify(slug)}
title: ${JSON.stringify(title)}
keywords: ${JSON.stringify(keywords)}
description: ${JSON.stringify(description)}
pageTitle: ${JSON.stringify(pageTitle)}
categoryName: ${JSON.stringify(categoryName)}
categoryUrl: ${JSON.stringify(categoryUrl)}
date: ${JSON.stringify(date)}
summary: ${JSON.stringify(summary)}
images: ${JSON.stringify(images)}
attributes: ${JSON.stringify(attributes)}
---

${cleanHtmlIndent(descContent)}
`;
      fs.mkdirSync('./src/data/products', { recursive: true });
      fs.writeFileSync(`./src/data/products/${slug}.md`, md, 'utf-8');
      prodCount++;
    }
  }

  // C. 处理图库详情页 -> src/data/gallery/*.md
  else if (relPath.startsWith('gallery/')) {
    const mainBody = matchOne(rawHtml, /<\/header>\s*(?:<!--\s*\/?#header\s*-->)?([\s\S]*?)<footer/i);
    const md = `---
slug: ${JSON.stringify(slug)}
title: ${JSON.stringify(title)}
keywords: ${JSON.stringify(keywords)}
description: ${JSON.stringify(description)}
bodyClass: ${JSON.stringify(bodyClass)}
---

${cleanHtmlIndent(mainBody)}
`;
    fs.mkdirSync('./src/data/gallery', { recursive: true });
    fs.writeFileSync(`./src/data/gallery/${slug}.md`, md, 'utf-8');
    galCount++;
  }

  // D. 处理根目录下的 products.html -> src/pages/products.astro
  else if (relPath === 'products.html') {
    const mainBody = matchOne(rawHtml, /<\/header>\s*(?:<!--\s*\/?#header\s*-->)?([\s\S]*?)<footer/i);
    const footerType = rawHtml.includes('class="postscript') ? 'postscript' : 'simple';
    const extraCss = rawHtml.includes('ctools.css') ? ['/css/ctools.css'] : [];
    const extraJs = rawHtml.includes('Isotope.js') ? ['/js/Isotope.js'] : [];
    const astroPage = `---
import BaseLayout from '../layouts/BaseLayout.astro';
const mainHtml = ${JSON.stringify(mainBody.trim())};
---
<BaseLayout
  title=${JSON.stringify(title)}
  keywords=${JSON.stringify(keywords)}
  description=${JSON.stringify(description)}
  bodyClass=${JSON.stringify(bodyClass)}
  footerType="${footerType}"
  extraCss={${JSON.stringify(extraCss)}}
  extraJs={${JSON.stringify(extraJs)}}
>
  <Fragment set:html={mainHtml} />
</BaseLayout>
`;
    fs.mkdirSync('./src/pages', { recursive: true });
    fs.writeFileSync('./src/pages/products.astro', astroPage, 'utf-8');
    rootProdCount++;
  }
});

console.log(`✅ 提取完成！已生成：${prodCount} 个产品数据、${catCount} 个分类页、${newsCount} 篇新闻数据、${galCount} 个图库数据、${rootProdCount} 个产品总览页。`);