#!/usr/bin/env node
/* worktree-guard.js — 세션 시작 시 "이 폴더를 나 혼자 쓰고 있나"를 알려준다.
 *
 * [왜 있나 — 2026-08-21 실사고 2회]
 *   두 세션이 같은 폴더에서 작업하다가, 한쪽의 `git add -A` 가 다른 쪽 미완성 파일을
 *   자기 커밋에 실어 갔다. 1차(`6506bd5`)는 **반쪽만** 나가서 배포본에 404 3건이 났고
 *   (로더 매니페스트는 커밋됐는데 모듈 파일은 untracked), 2차(`35a9dd5`)는 운좋게 온전했다.
 *   운에 기대는 상태를 그대로 두면 3차가 난다.
 *
 * [이 스크립트가 하는 일과 안 하는 일]
 *   한다  : 위험 신호를 **세션 시작 시점에** 눈앞에 띄운다.
 *   안 한다: 작업을 막지 않는다. 정당한 단독 작업까지 막으면 사람들이 가드를 꺼버린다.
 *           실제 차단은 `pre-commit` 의 smoke --git 이 담당한다(증상 지점에서 정확히 막음).
 *
 * 판정은 보수적으로 한다 — "다른 세션이 지금 붙어 있다"는 git 만으로는 알 수 없다.
 * 그래서 **구조적 위험**(주 트리 + main + 다른 worktree 존재)만 신호로 쓴다.
 *
 * 사용: node scripts/worktree-guard.js [--json]
 */
'use strict';
const { execFileSync } = require('child_process');

function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
  catch (_e) { return null; }
}

const top = git(['rev-parse', '--show-toplevel']);
if (!top) { process.exit(0); }                      // git 저장소가 아니면 조용히 끝낸다

const branch = git(['branch', '--show-current']) || '';
const listRaw = git(['worktree', 'list', '--porcelain']) || '';
const trees = listRaw.split('\n\n').map((blk) => {
  const path = (blk.match(/^worktree (.+)$/m) || [])[1];
  const br = (blk.match(/^branch refs\/heads\/(.+)$/m) || [])[1] || null;
  const detached = /^detached$/m.test(blk);
  return path ? { path, branch: br, detached } : null;
}).filter(Boolean);

// 주 트리 = worktree list 의 첫 항목 (git 이 항상 먼저 낸다)
const primary = trees.length ? trees[0].path : top;
const isPrimary = top === primary;
const others = trees.filter((t) => t.path !== top);
const detached = !branch;

/* 위험 판정:
   주 트리에서 main 을 직접 잡고 있고, 다른 worktree 도 살아 있으면
   "여러 작업이 동시에 돌아가는 저장소인데 나는 공용 자리에 앉아 있다" 는 뜻이다.
   이번 사고가 정확히 이 조합에서 났다. */
const sharedRisk = isPrimary && (branch === 'main' || branch === 'master') && others.length > 0;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    toplevel: top, branch: branch || null, detached,
    isPrimary, otherWorktrees: others.length, sharedRisk
  }, null, 2));
  process.exit(0);
}

if (detached) {
  console.log('⚠️  detached HEAD 상태입니다 — 커밋해도 어느 브랜치에도 안 남습니다.');
}

if (sharedRisk) {
  const name = '<작업이름>';
  console.log(`
🔴 공유 워킹트리 경고 — 이 폴더는 여러 세션이 함께 쓰는 자리입니다.
   현재: 주 트리 · branch=${branch} · 다른 worktree ${others.length}개 동작 중

   2026-08-21 에 여기서 사고가 두 번 났습니다. 다른 세션이 \`git add -A\` 를 하면
   내 미완성 파일이 그쪽 커밋에 실려 나가고, 반쪽만 나가면 배포본이 깨집니다
   (실제로 라이브에서 404 3건 → 편집기 열 때마다 스크립트 89개 재요청).

   여러 파일을 고칠 작업이면 자기 워킹트리에서 하세요:
     git worktree add ../itdasy-wt-${name} -b feat/${name}
     cd ../itdasy-wt-${name}
     # 끝나면
     git worktree remove ../itdasy-wt-${name}

   문서 한 줄 수정처럼 짧은 작업이면 여기서 해도 됩니다.
   (커밋 시 pre-commit 이 '저장소에 없는 파일을 부르는지' 한 번 더 막습니다)
`);
} else {
  console.log(`✅ 워킹트리 ${isPrimary ? '주 트리' : '분리됨'} · branch=${branch || '(detached)'} · 다른 worktree ${others.length}개`);
}
