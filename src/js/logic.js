/* ============================================================
   星星五子棋 · 棋盘逻辑与电脑对手
   棋盘 9x9，先连成 5 子者获胜
   ============================================================ */
var LOGIC = (function () {
  'use strict';

  var N = 15;
  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  function idx(x, y) { return y * N + x; }
  function inB(x, y) { return x >= 0 && x < N && y >= 0 && y < N; }
  function create() { return new Int8Array(N * N); }

  /* 返回构成五连的坐标数组；没有则返回 null */
  function winLine(bd, x, y) {
    var p = bd[idx(x, y)];
    if (!p) return null;
    for (var d = 0; d < 4; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1];
      var cells = [[x, y]];
      var i, cx, cy;
      for (i = 1; i < 9; i++) {
        cx = x + dx * i; cy = y + dy * i;
        if (inB(cx, cy) && bd[idx(cx, cy)] === p) cells.push([cx, cy]); else break;
      }
      for (i = 1; i < 9; i++) {
        cx = x - dx * i; cy = y - dy * i;
        if (inB(cx, cy) && bd[idx(cx, cy)] === p) cells.unshift([cx, cy]); else break;
      }
      if (cells.length >= 5) return cells;
    }
    return null;
  }

  /* 落子后是否直接获胜（不修改棋盘） */
  function wouldWin(bd, x, y, p) {
    bd[idx(x, y)] = p;
    var w = winLine(bd, x, y);
    bd[idx(x, y)] = 0;
    return !!w;
  }

  /* 单点评分：只看以该点为中心的四个方向 */
  function shapeScore(c, openEnds) {
    if (c >= 5) return 1000000;
    if (c === 4) return openEnds >= 2 ? 120000 : (openEnds === 1 ? 12000 : 0);
    if (c === 3) return openEnds >= 2 ? 9000 : (openEnds === 1 ? 900 : 0);
    if (c === 2) return openEnds >= 2 ? 320 : (openEnds === 1 ? 60 : 0);
    if (c === 1) return openEnds >= 2 ? 24 : 8;
    return 0;
  }

  function scoreCell(bd, x, y, p) {
    var total = 0;
    for (var d = 0; d < 4; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1];
      var count = 1, openA = false, openB = false, steps, cx, cy;

      cx = x + dx; cy = y + dy; steps = 0;
      while (steps < 4 && inB(cx, cy) && bd[idx(cx, cy)] === p) { count++; steps++; cx += dx; cy += dy; }
      if (inB(cx, cy) && bd[idx(cx, cy)] === 0) openA = true;

      cx = x - dx; cy = y - dy; steps = 0;
      while (steps < 4 && inB(cx, cy) && bd[idx(cx, cy)] === p) { count++; steps++; cx -= dx; cy -= dy; }
      if (inB(cx, cy) && bd[idx(cx, cy)] === 0) openB = true;

      total += shapeScore(count, (openA ? 1 : 0) + (openB ? 1 : 0));
    }
    return total;
  }

  /* 候选点：已有棋子 2 格范围内的空点；空盘则取天元 */
  function candidates(bd) {
    var list = [], x, y, dx, dy, near;
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        if (bd[idx(x, y)] !== 0) continue;
        near = false;
        for (dy = -2; dy <= 2 && !near; dy++) {
          for (dx = -2; dx <= 2; dx++) {
            if (!dx && !dy) continue;
            if (inB(x + dx, y + dy) && bd[idx(x + dx, y + dy)] !== 0) { near = true; break; }
          }
        }
        if (near) list.push({ x: x, y: y });
      }
    }
    if (!list.length) list.push({ x: (N - 1) >> 1, y: (N - 1) >> 1 });
    return list;
  }

  function centerBias(x, y) {
    var c = (N - 1) / 2;
    var d = Math.abs(x - c) + Math.abs(y - c);
    return Math.max(0, 30 - d * 2.4);
  }

  function pickRandom(arr) { return arr[(Math.random() * arr.length) | 0]; }

  /* level: 'easy' | 'normal' */
  function aiMove(bd, me, level) {
    var foe = me === 1 ? 2 : 1;
    var cands = candidates(bd);
    var i, c, best = null, bestScore = -1e9;

    /* 1. 能赢就赢 */
    for (i = 0; i < cands.length; i++) {
      c = cands[i];
      if (wouldWin(bd, c.x, c.y, me)) return c;
    }

    /* 2. 挡对手的五连成四 */
    var blockChance = level === 'easy' ? 0.7 : 1;
    if (Math.random() <= blockChance) {
      for (i = 0; i < cands.length; i++) {
        c = cands[i];
        if (wouldWin(bd, c.x, c.y, foe)) return c;
      }
    }

    /* 3. 简单模式：有一定概率随手走 */
    if (level === 'easy' && Math.random() < 0.45) {
      return pickRandom(cands);
    }

    /* 4. 评分：进攻 + 防守（防守略低于进攻，鼓励主动） */
    var atk, def, sc;
    for (i = 0; i < cands.length; i++) {
      c = cands[i];
      atk = scoreCell(bd, c.x, c.y, me);
      def = scoreCell(bd, c.x, c.y, foe) * (level === 'easy' ? 0.55 : 0.9);
      sc = atk + def + centerBias(c.x, c.y);
      if (level === 'easy') sc *= 0.8 + Math.random() * 0.45;
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    return best || cands[0];
  }

  return {
    N: N, idx: idx, inB: inB, create: create,
    winLine: winLine, wouldWin: wouldWin,
    candidates: candidates, aiMove: aiMove
  };
})();
