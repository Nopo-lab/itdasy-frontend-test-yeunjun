#!/usr/bin/env node

/**
 * GC Weekly Reporter
 *
 * Read-only script that scans the repository and reports potential cleanup items
 * without modifying any files.
 *
 * Usage: node scripts/gc-weekly.js [--dry-run]
 * Exit code: 0 if changes found, 1 if no changes, 2 on error
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GC_REPORTS_DIR = path.join(ROOT, '.ai', 'gc-reports');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');

const isDryRun = process.argv.includes('--dry-run');

// Helper: Get timestamp in KST
function getKSTDate() {
  const now = new Date();
  const offset = 9 * 60;
  const kstDate = new Date(now.getTime() + offset * 60000);
  return kstDate.toISOString().split('T')[0];
}

// Helper: Safe file read
function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

// Helper: Count lines
function countLines(content) {
  return content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
}

// Helper: Recursively find all source files
function findSourceFiles() {
  const files = [];
  const patterns = /\.(js|css|html)$/;

  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'node_modules') continue;

        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (patterns.test(entry)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  walk(ROOT);
  return files.sort();
}

// Analysis 1: File line counts vs CLAUDE.md
function analyzeFileSizes() {
  const claudeMd = safeRead(CLAUDE_MD);
  const findings = [];

  const files = findSourceFiles();

  for (const filePath of files) {
    const content = safeRead(filePath);
    const lineCount = countLines(content);
    const relPath = path.relative(ROOT, filePath);

    if (lineCount > 1000) {
      // Extract from CLAUDE.md if mentioned
      const regex = new RegExp(`${relPath}[\\s\\S]*?(\\d+)\\s*줄`, 'i');
      const match = claudeMd.match(regex);
      const docLines = match ? parseInt(match[1]) : null;

      if (docLines && Math.abs(docLines - lineCount) > 10) {
        findings.push({
          file: relPath,
          docLines,
          actualLines: lineCount,
          mismatch: lineCount - docLines,
        });
      } else if (!match && lineCount > 1000) {
        findings.push({
          file: relPath,
          docLines: null,
          actualLines: lineCount,
          mismatch: null,
          note: 'CLAUDE.md에 미기재',
        });
      }
    }
  }

  return findings;
}

// Analysis 2: Inline onclick handlers
function countInlineHandlers() {
  const files = findSourceFiles();
  let total = 0;

  for (const filePath of files) {
    const content = safeRead(filePath);
    const matches = content.match(/onclick\s*=/gi);
    if (matches) total += matches.length;
  }

  return total;
}

// Analysis 3: localStorage key usage
function analyzeStorageKeys() {
  const files = findSourceFiles();
  const keys = {};

  for (const filePath of files) {
    const content = safeRead(filePath);
    const matches = content.match(/itdasy_[\w]*/g);
    if (matches) {
      for (const key of matches) {
        keys[key] = (keys[key] || 0) + 1;
      }
    }
  }

  return Object.entries(keys)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));
}

// Analysis 4: Leftover TD ticket IDs
function findLegacyTickets() {
  const files = findSourceFiles();
  const tickets = new Set();

  for (const filePath of files) {
    const content = safeRead(filePath);
    const matches = content.match(/TD-\d+/g);
    if (matches) {
      matches.forEach(t => tickets.add(t));
    }
  }

  return Array.from(tickets).sort();
}

// Analysis 5: Large files (500+ lines)
function findLargeFiles() {
  const files = findSourceFiles();
  const large = [];

  for (const filePath of files) {
    const content = safeRead(filePath);
    const lineCount = countLines(content);
    const relPath = path.relative(ROOT, filePath);

    if (lineCount > 500) {
      large.push({
        file: relPath,
        lines: lineCount,
      });
    }
  }

  return large.sort((a, b) => b.lines - a.lines);
}

// Analysis 6: Suspected unused files (no imports/requires)
function findUnusedFiles() {
  const allFiles = findSourceFiles();
  const srcFiles = allFiles.filter(f => !f.includes('/__tests__') && !f.includes('.test.'));
  const unused = [];

  for (const filePath of srcFiles) {
    const content = safeRead(filePath);
    const fileName = path.basename(filePath);

    // Skip special files
    if (/^(index|app-core|app-oauth)/.test(fileName)) continue;

    let isReferenced = false;

    for (const otherFile of srcFiles) {
      if (otherFile === filePath) continue;
      const otherContent = safeRead(otherFile);

      if (otherContent.includes(fileName) || otherContent.includes(`'${fileName}'`)) {
        isReferenced = true;
        break;
      }
    }

    if (!isReferenced && !content.includes('export ') && !content.includes('module.exports')) {
      unused.push({
        file: path.relative(ROOT, filePath),
        lines: countLines(content),
      });
    }
  }

  return unused;
}

// Combine all findings into a report
function generateReport() {
  const date = getKSTDate();
  const report = [];

  report.push('# 주간 청소 리포트');
  report.push(`\n**생성일:** ${date} KST`);
  report.push('\n## 📊 요약\n');

  // Run all analyses
  const fileSizeMismatches = analyzeFileSizes();
  const onclickCount = countInlineHandlers();
  const storageKeys = analyzeStorageKeys();
  const legacyTickets = findLegacyTickets();
  const largeFiles = findLargeFiles();
  const unusedFiles = findUnusedFiles();

  let totalItems = 0;

  // Summary
  if (fileSizeMismatches.length > 0) {
    report.push(`- 📏 파일 크기 불일치: ${fileSizeMismatches.length}개`);
    totalItems += fileSizeMismatches.length;
  }

  if (legacyTickets.length > 0) {
    report.push(`- 🏷️ 구식 티켓 ID 남음: ${legacyTickets.length}개`);
    totalItems += legacyTickets.length;
  }

  if (largeFiles.length > 0) {
    report.push(`- 📦 500줄 초과 파일: ${largeFiles.length}개`);
    totalItems += largeFiles.length;
  }

  if (unusedFiles.length > 0) {
    report.push(`- 🗑️ 미사용 파일 후보: ${unusedFiles.length}개`);
    totalItems += unusedFiles.length;
  }

  if (onclickCount > 0) {
    report.push(`- 🔗 인라인 핸들러: ${onclickCount}개 (마이그레이션 대상)`);
  }

  if (storageKeys.length > 0) {
    report.push(`- 🔑 localStorage 키: ${storageKeys.length}개 활성`);
  }

  // Details
  if (fileSizeMismatches.length > 0) {
    report.push('\n## 📏 파일 크기 불일치\n');
    for (const item of fileSizeMismatches) {
      const diff = item.mismatch > 0 ? `+${item.mismatch}` : item.mismatch;
      report.push(`- \`${item.file}\`: 문서 ${item.docLines}줄 → 실제 ${item.actualLines}줄 (${diff})`);
    }
  }

  if (legacyTickets.length > 0) {
    report.push('\n## 🏷️ 구식 티켓 ID\n');
    report.push('Phase 1 종료까지 모두 제거 예정:\n');
    for (const ticket of legacyTickets) {
      report.push(`- ${ticket}`);
    }
  }

  if (largeFiles.length > 0) {
    report.push('\n## 📦 대형 파일 (500줄+)\n');
    report.push('분할 대상:\n');
    for (const file of largeFiles) {
      report.push(`- \`${file.file}\`: ${file.lines}줄`);
    }
  }

  if (unusedFiles.length > 0) {
    report.push('\n## 🗑️ 미사용 파일 후보\n');
    report.push('참조 없음 & 명시적 export 없음:\n');
    for (const file of unusedFiles) {
      report.push(`- \`${file.file}\`: ${file.lines}줄 (삭제 검토)`);
    }
  }

  if (onclickCount > 0) {
    report.push(`\n## 🔗 인라인 핸들러 추이\n`);
    report.push(`현재: ${onclickCount}개\n`);
    report.push('→ `addEventListener` + 이벤트 위임 패턴으로 마이그레이션 필요\n');
  }

  if (storageKeys.length > 0) {
    report.push('\n## 🔑 localStorage 키 사용 빈도\n');
    for (const item of storageKeys.slice(0, 10)) {
      report.push(`- \`${item.key}\`: ${item.count}회`);
    }
    if (storageKeys.length > 10) {
      report.push(`... 외 ${storageKeys.length - 10}개`);
    }
  }

  report.push('\n---\n');
  report.push('**생성:** T4 Ops (자동 리포트)\n');

  return {
    content: report.join('\n'),
    date,
    totalItems,
    hasMismatches: fileSizeMismatches.length > 0,
    hasLegacyTickets: legacyTickets.length > 0,
    hasLargeFiles: largeFiles.length > 0,
    hasUnusedFiles: unusedFiles.length > 0,
  };
}

// Check if there were changes since last report
function hasChanges(currentReport) {
  const lastReportPath = path.join(GC_REPORTS_DIR, 'LAST_REPORT.json');

  try {
    const lastReport = JSON.parse(fs.readFileSync(lastReportPath, 'utf8'));

    return (
      lastReport.hasMismatches !== currentReport.hasMismatches ||
      lastReport.hasLegacyTickets !== currentReport.hasLegacyTickets ||
      lastReport.hasLargeFiles !== currentReport.hasLargeFiles ||
      lastReport.hasUnusedFiles !== currentReport.hasUnusedFiles
    );
  } catch {
    return true; // First run or can't read last report
  }
}

// Save report
function saveReport(report) {
  try {
    if (!fs.existsSync(GC_REPORTS_DIR)) {
      fs.mkdirSync(GC_REPORTS_DIR, { recursive: true });
    }

    const reportPath = path.join(GC_REPORTS_DIR, `${report.date}.md`);
    fs.writeFileSync(reportPath, report.content, 'utf8');

    // Save metadata for change detection
    const lastReportPath = path.join(GC_REPORTS_DIR, 'LAST_REPORT.json');
    fs.writeFileSync(lastReportPath, JSON.stringify({
      date: report.date,
      hasMismatches: report.hasMismatches,
      hasLegacyTickets: report.hasLegacyTickets,
      hasLargeFiles: report.hasLargeFiles,
      hasUnusedFiles: report.hasUnusedFiles,
    }, null, 2), 'utf8');

    console.log(`✅ Report saved: ${reportPath}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to save report: ${err.message}`);
    return false;
  }
}

// Main
function main() {
  try {
    console.log('🧹 GC Weekly Reporter started...\n');

    const report = generateReport();

    console.log(report.content);
    console.log('\n');

    const changed = hasChanges(report);
    console.log(`📊 Changes detected: ${changed ? 'YES' : 'NO'}`);
    console.log(`📋 Total items to review: ${report.totalItems}`);

    if (!isDryRun) {
      saveReport(report);

      if (changed) {
        console.log(`\n✅ Issue should be created for: ${report.date}`);
        process.exit(0);
      } else {
        console.log('\n⏭️ No changes since last week, skipping issue creation');
        process.exit(1);
      }
    } else {
      console.log('\n(dry-run: not saving or creating issues)');
      process.exit(0);
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(2);
  }
}

main();
