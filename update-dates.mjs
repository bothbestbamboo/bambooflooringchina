import fs from 'node:fs';
import path from 'node:path';

const TARGET_DIR = path.resolve('src/data/products');
const NEW_DATE = '2026-11-10';

// 仅匹配 frontmatter 中 date: 开头的行，只替换日期部分，保留后面的时间、引号和原换行符
const DATE_REGEX = /^(date:\s*["']?)\d{4}-\d{1,2}-\d{1,2}([^\r\n]*)/m;

function updateDir(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  let updated = 0;
  let skipped = 0;

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const sub = updateDir(fullPath);
      updated += sub.updated;
      skipped += sub.skipped;
      continue;
    }

    if (!entry.name.endsWith('.md')) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    const newContent = content.replace(
      DATE_REGEX,
      (_, prefix, rest) => `${prefix}${NEW_DATE}${rest}`
    );

    if (newContent !== content) {
      fs.writeFileSync(fullPath, newContent, 'utf8');
      console.log(`已修改: ${entry.name}`);
      updated++;
    } else {
      console.log(`跳过: ${entry.name}`);
      skipped++;
    }
  }

  return { updated, skipped };
}

const { updated, skipped } = updateDir(TARGET_DIR);
console.log(`\n执行完成：共更新 ${updated} 个文件，跳过 ${skipped} 个文件。`);