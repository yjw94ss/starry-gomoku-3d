/* ============================================================
   星星五子棋 · 交互与界面
   ============================================================ */
(function () {
  'use strict';

  var N = 15;

  var state = {
    board: LOGIC.create(),
    turn: 1,
    over: false,
    mode: 'ai',
    level: 'easy',
    history: [],
    winCells: null,
    aiToken: 0,
    busy: false,
    started: false
  };

  /* ---------------- 音效（WebAudio，无外部文件） ---------------- */
  var Sound = (function () {
    var ctx = null, master = null, enabled = true;

    function ensure() {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') { ctx.resume(); }
      return ctx;
    }

    function tone(f, to, dur, type, vol, delay) {
      if (!enabled || !ensure()) return;
      var t0 = ctx.currentTime + (delay || 0);
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t0);
      if (to) { o.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur); }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    }

    return {
      unlock: function () { ensure(); },
      place: function (p) {
        tone(p === 1 ? 330 : 420, p === 1 ? 210 : 260, 0.16, 'sine', 0.34, 0);
        tone(p === 1 ? 660 : 840, null, 0.05, 'triangle', 0.10, 0);
      },
      win: function () {
        var notes = [523.25, 659.25, 783.99, 1046.5];
        for (var i = 0; i < notes.length; i++) {
          tone(notes[i], null, 0.42, 'triangle', 0.17, i * 0.11);
        }
        tone(1318.5, null, 0.7, 'sine', 0.10, 0.46);
      },
      lose: function () {
        var notes = [392, 329.63, 261.63];
        for (var i = 0; i < notes.length; i++) {
          tone(notes[i], null, 0.4, 'sine', 0.14, i * 0.13);
        }
      },
      blocked: function () { tone(180, 120, 0.13, 'square', 0.10, 0); },
      tap: function () { tone(720, 980, 0.07, 'triangle', 0.10, 0); },
      toggle: function () {
        enabled = !enabled;
        if (master) master.gain.value = enabled ? 0.5 : 0;
        return enabled;
      },
      isOn: function () { return enabled; }
    };
  })();

  /* ---------------- DOM ---------------- */
  var el = {};
  function $(id) { return document.getElementById(id); }
  function bindDom() {
    el.canvas = $('game');
    el.turnDot = $('turnDot');
    el.turnText = $('turnText');
    el.undo = $('btnUndo');
    el.restart = $('btnRestart');
    el.modes = $('modes');
    el.overlay = $('overlay');
    el.ovTitle = $('ovTitle');
    el.ovSub = $('ovSub');
    el.ovAgain = $('ovAgain');
    el.start = $('start');
    el.startBtn = $('startBtn');
    el.toast = $('toast');
    el.soundBtn = $('btnSound');
    el.hint = $('hint');
  }

  /* ---------------- 轻提示 ---------------- */
  var toastTimer = null;
  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('on'); }, 1500);
  }

  /* ---------------- 界面刷新 ---------------- */
  function updateUI() {
    if (!el.turnDot) return;
    if (state.over) {
      el.turnText.textContent = '这局结束啦';
      el.turnDot.className = 'dot ' + (state.winCells ? (state.turn === 1 ? 'black' : 'white') : 'none');
    } else {
      el.turnText.textContent = (state.busy && state.mode === 'ai' ? '小白正在想…' : '轮到 ' + (state.turn === 1 ? '小黑' : '小白') + ' 落子');
      el.turnDot.className = 'dot ' + (state.turn === 1 ? 'black' : 'white');
    }
    if (el.undo) el.undo.disabled = state.history.length === 0 || !state.started;
  }

  /* ---------------- 落子流程 ---------------- */
  function tryPlace(x, y, fromAI) {
    if (!state.started || state.over || state.busy) return false;
    if (state.mode === 'ai' && !fromAI && state.turn !== 1) return false;
    if (x < 0 || x >= N || y < 0 || y >= N) return false;

    if (state.board[LOGIC.idx(x, y)] !== 0) {
      if (!fromAI) { Sound.blocked(); toast('这里已经有一颗小棋子啦'); }
      return false;
    }

    var player = state.turn;
    state.board[LOGIC.idx(x, y)] = player;
    state.history.push({ x: x, y: y, p: player });
    SCENE3D.placeStone(x, y, player, true);
    SCENE3D.setLast({ x: x, y: y });
    SCENE3D.hover(null, player);
    Sound.place(player);

    var line = LOGIC.winLine(state.board, x, y);
    if (line) {
      finish(line, player);
      return true;
    }
    if (state.history.length >= N * N) {
      finish(null, 0);
      return true;
    }

    state.turn = player === 1 ? 2 : 1;
    updateUI();

    if (state.mode === 'ai' && state.turn === 2) scheduleAI();
    return true;
  }

  function finish(line, winner) {
    state.over = true;
    state.winCells = line;
    if (line) {
      state.turn = winner;
      SCENE3D.playWin(line, winner);
      if (state.mode === 'ai') {
        if (winner === 1) { Sound.win(); } else { Sound.lose(); }
      } else {
        Sound.win();
      }
      showOverlay(winner);
    } else {
      state.turn = 1;
      Sound.tap();
      showOverlay(0);
    }
    updateUI();
  }

  var ovTimer = null;
  function showOverlay(winner) {
    var name = winner === 1 ? '小黑' : '小白';
    if (!winner) {
      el.ovTitle.textContent = '平局啦';
      el.ovSub.textContent = '棋盘都下满了，你们一样厉害！';
    } else if (state.mode === 'ai' && winner === 2) {
      el.ovTitle.textContent = '小白赢啦';
      el.ovSub.textContent = '别灰心，它可是电脑哦，再来一局试试！';
    } else {
      el.ovTitle.textContent = name + '赢啦！';
      el.ovSub.textContent = winner === 1 ? '五颗棋子连成了一条线，真棒！' : '五颗棋子连成了一条线，恭喜！';
    }
    if (ovTimer) clearTimeout(ovTimer);
    ovTimer = setTimeout(function () {
      el.overlay.classList.add('on');
    }, 1500);
  }
  function hideOverlay() {
    if (ovTimer) { clearTimeout(ovTimer); ovTimer = null; }
    el.overlay.classList.remove('on');
  }

  /* ---------------- 电脑落子 ---------------- */
  function scheduleAI() {
    state.busy = true;
    updateUI();
    var token = ++state.aiToken;
    var delay = 420 + Math.random() * 300;
    setTimeout(function () {
      if (token !== state.aiToken || state.over || !state.started) { return; }
      var mv = LOGIC.aiMove(state.board, 2, state.level);
      state.busy = false;
      if (mv) {
        tryPlace(mv.x, mv.y, true);
      } else {
        updateUI();
      }
    }, delay);
  }

  /* ---------------- 悔棋 / 重开 ---------------- */
  function popOne() {
    var m = state.history.pop();
    if (!m) return;
    state.board[LOGIC.idx(m.x, m.y)] = 0;
    SCENE3D.removeStone(m.x, m.y);
  }

  function doUndo() {
    if (!state.started || state.history.length === 0) return;
    state.aiToken++;
    state.busy = false;
    state.over = false;
    state.winCells = null;
    hideOverlay();
    SCENE3D.clearWin();

    if (state.mode === 'ai') {
      while (state.history.length && state.history[state.history.length - 1].p === 2) popOne();
      if (state.history.length && state.history[state.history.length - 1].p === 1) popOne();
    } else {
      popOne();
    }

    var last = state.history.length ? state.history[state.history.length - 1] : null;
    state.turn = last ? (last.p === 1 ? 2 : 1) : 1;
    if (state.mode === 'ai') state.turn = 1;
    if (state.history.length) {
      var lm = state.history[state.history.length - 1];
      SCENE3D.setLast({ x: lm.x, y: lm.y });
    } else {
      SCENE3D.setLast(null);
    }
    Sound.tap();
    updateUI();
  }

  function resetGame() {
    state.aiToken++;
    state.board = LOGIC.create();
    state.turn = 1;
    state.over = false;
    state.busy = false;
    state.history = [];
    state.winCells = null;
    SCENE3D.clearWin();
    SCENE3D.clearStones();
    SCENE3D.setLast(null);
    hideOverlay();
    updateUI();
    Sound.tap();
  }

  /* ---------------- 模式切换 ---------------- */
  function setMode(mode, level) {
    var changed = (mode !== state.mode) || (level && level !== state.level);
    state.mode = mode;
    if (level) state.level = level;
    var btns = el.modes.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var m = b.getAttribute('data-mode');
      var lv = b.getAttribute('data-level');
      var on = (m === mode) && (mode === 'pvp' || lv === state.level);
      b.classList.toggle('on', on);
    }
    if (changed) {
      resetGame();
      toast(mode === 'pvp' ? '双人模式：两个人轮流下' : (state.level === 'easy' ? '简单模式：新手也能赢' : '普通模式：它会认真下哦'));
    }
  }

  /* ---------------- 指针交互 ---------------- */
  var pointers = new Map();
  var drag = { active: false, x: 0, y: 0, moved: 0, t0: 0 };
  var pinchPrev = 0;

  function dist2(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onDown(e) {
    if (!state.started) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      drag.active = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved = 0;
      drag.t0 = performance.now();
      pinchPrev = 0;
    } else if (pointers.size === 2) {
      drag.active = false;
      var arr = Array.from(pointers.values());
      pinchPrev = dist2(arr[0], arr[1]);
    }
  }

  function onMove(e) {
    var p = pointers.get(e.pointerId);

    /* 双指缩放 */
    if (pointers.size === 2 && pinchPrev > 0) {
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      var arr = Array.from(pointers.values());
      var d = dist2(arr[0], arr[1]);
      if (d > 10) {
        SCENE3D.zoomBy(pinchPrev / d);
        pinchPrev = d;
      }
      return;
    }

    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
    }

    if (drag.active) {
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 4) {
        SCENE3D.rotate(dx, dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        SCENE3D.unhover();
      }
      return;
    }

    /* 鼠标悬停预览 */
    if (e.pointerType === 'mouse' && state.started && !state.over && !state.busy) {
      if (state.mode === 'ai' && state.turn !== 1) { SCENE3D.unhover(); return; }
      var cell = SCENE3D.pickCell(e.clientX, e.clientY);
      if (cell && state.board[LOGIC.idx(cell.x, cell.y)] === 0) {
        SCENE3D.hover(cell, state.turn);
      } else {
        SCENE3D.unhover();
      }
    }
  }

  function onUp(e) {
    var had = pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchPrev = 0;

    if (!drag.active || !had) return;
    drag.active = false;

    var dt = performance.now() - drag.t0;
    if (drag.moved < 9 && dt < 750) {
      var cell = SCENE3D.pickCell(drag.x, drag.y);
      if (cell) {
        tryPlace(cell.x, cell.y, false);
      }
    }
  }

  function onCancel(e) {
    pointers.delete(e.pointerId);
    drag.active = false;
    pinchPrev = 0;
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    bindDom();
    document.body.classList.add('intro');

    window.addEventListener('error', function (ev) {
      API.errs.push(String(ev.message));
    });
    window.addEventListener('unhandledrejection', function (ev) {
      API.errs.push('promise: ' + String(ev.reason));
    });

    SCENE3D.init(el.canvas);

    var c = el.canvas;
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onCancel);
    c.addEventListener('pointerleave', function (e) {
      if (!pointers.has(e.pointerId)) SCENE3D.unhover();
    });
    c.addEventListener('wheel', function (e) {
      e.preventDefault();
      SCENE3D.zoomBy(1 + e.deltaY * 0.0014);
    }, { passive: false });
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); });

    el.undo.addEventListener('click', function () { Sound.tap(); doUndo(); });
    el.restart.addEventListener('click', function () {
      Sound.tap();
      resetGame();
      toast('新的棋盘，开始吧！');
    });
    el.ovAgain.addEventListener('click', function () {
      Sound.tap();
      resetGame();
    });
    el.soundBtn.addEventListener('click', function () {
      var on = Sound.toggle();
      el.soundBtn.classList.toggle('off', !on);
      el.soundBtn.setAttribute('aria-label', on ? '关闭音效' : '打开音效');
      if (on) Sound.tap();
    });

    var btns = el.modes.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          Sound.tap();
          setMode(btn.getAttribute('data-mode'), btn.getAttribute('data-level'));
        });
      })(btns[i]);
    }

    el.startBtn.addEventListener('click', function () {
      Sound.unlock();
      Sound.tap();
      state.started = true;
      document.body.classList.remove('intro');
      el.start.classList.add('gone');
      setTimeout(function () { el.start.style.display = 'none'; }, 620);
      SCENE3D.setIntroDone();
      updateUI();
      setTimeout(function () { toast('点一下棋盘，就能落子啦'); }, 900);
      setTimeout(function () {
        if (el.hint) el.hint.classList.add('fade');
      }, 6500);
    });

    updateUI();
    SCENE3D.fitView(false);
    window.GOMOKU = API;   // 初始化完成后再暴露调试/自动化接口
  }

  /* ---------------- 调试 / 自动化接口 ---------------- */
  var API = {
    errs: [],
    ready: true,
    get state() {
      return {
        board: Array.from(state.board),
        turn: state.turn,
        over: state.over,
        mode: state.mode,
        level: state.level,
        history: state.history.slice(),
        winCells: state.winCells,
        busy: state.busy,
        started: state.started
      };
    },
    place: function (x, y) { return tryPlace(x, y, false); },
    reset: function () { resetGame(); },
    undo: function () { doUndo(); },
    setMode: function (m, l) { setMode(m, l); },
    start: function () {
      if (!state.started) {
        state.started = true;
        document.body.classList.remove('intro');
        el.start.classList.add('gone');
        SCENE3D.setIntroDone();
        updateUI();
      }
    },
    screenOf: function (x, y) { return SCENE3D.screenOf(x, y); },
    pickAt: function (x, y) { return SCENE3D.pickCell(x, y); },
    cam: function () { return SCENE3D.cameraState(); },
    look: function (yaw, pitch, d) {
      SCENE3D.look(yaw, pitch, d);
    },
    stats: function () { return SCENE3D.stats(); },
    overlays: function () {
      return {
        win: el.overlay.classList.contains('on'),
        title: el.ovTitle.textContent,
        start: !el.start.classList.contains('gone')
      };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
