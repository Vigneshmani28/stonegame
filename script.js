(function () {
  'use strict';

  var STONE_COUNT = 16;
  var PER_LINE = 8;
  var ROUNDS = 4;
  var RELAYS = 3;
  var LEFT = 0;
  var RIGHT = 1;

  var FIRST_PICK = ['named', 'other', 'named'];

  var REVEAL_PLACE = FIRST_PICK.reduce(function (place, who) {
    return place * 2 + (who === 'other' ? 1 : 0);
  }, 0);

  function otherSide(side) {
    return side === LEFT ? RIGHT : LEFT;
  }

  var Trick = {
    LEFT: LEFT,
    RIGHT: RIGHT,
    ROUNDS: ROUNDS,
    RELAYS: RELAYS,
    FIRST_PICK: FIRST_PICK,
    REVEAL_PLACE: REVEAL_PLACE,

    createStones: function () {
      var stones = [];
      for (var id = 0; id < STONE_COUNT; id++) {
        stones.push({ id: id, originalPosition: id });
      }
      return stones;
    },

    startingLayout: function (stones) {
      var layout = [[], []];
      stones.forEach(function (stone) {
        var side = stone.originalPosition < PER_LINE ? LEFT : RIGHT;
        var fromTop = stone.originalPosition % PER_LINE;
        layout[side][PER_LINE - 1 - fromTop] = stone.id;
      });
      return layout;
    },

    firstSide: function (relay, namedSide, pattern) {
      return (pattern || FIRST_PICK)[relay] === 'named' ? namedSide : otherSide(namedSide);
    },

    pickUp: function (layout, firstSide) {
      var secondSide = otherSide(firstSide);
      var hand = [];
      for (var place = 0; place < PER_LINE; place++) {
        hand.push(layout[firstSide][place], layout[secondSide][place]);
      }
      return hand;
    },

    layDown: function (hand) {
      var layout = [[], []];
      layout[RIGHT] = hand.slice(0, PER_LINE);
      layout[LEFT] = hand.slice(PER_LINE);
      return layout;
    },

    relay: function (layout, namedSide, relayIndex, pattern) {
      var hand = Trick.pickUp(layout, Trick.firstSide(relayIndex, namedSide, pattern));
      return { hand: hand, layout: Trick.layDown(hand) };
    },

    findStone: function (layout, namedSide, revealPlace) {
      return layout[namedSide][revealPlace === undefined ? REVEAL_PLACE : revealPlace];
    },

    sideOf: function (layout, id) {
      return layout[LEFT].indexOf(id) !== -1 ? LEFT : RIGHT;
    }
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = Trick;
  }
  if (typeof document === 'undefined') {
    return;
  }

  var state = {
    phase: 'think',
    stones: [],
    currentLayout: [[], []],
    currentRound: 0,
    answers: [],
    foundStone: null,
    busy: false
  };

  var view = new Map();

  var el = {
    game: document.getElementById('game'),
    board: document.getElementById('board'),
    stones: document.getElementById('stones'),
    prompt: document.getElementById('prompt'),
    note: document.getElementById('note'),
    progressLabel: document.getElementById('progressLabel'),
    pips: Array.prototype.slice.call(document.querySelectorAll('#pips i')),
    groupThink: document.getElementById('groupThink'),
    groupAsk: document.getElementById('groupAsk'),
    groupReveal: document.getElementById('groupReveal'),
    btnDone: document.getElementById('btnDone'),
    btnLeft: document.getElementById('btnLeft'),
    btnRight: document.getElementById('btnRight'),
    btnAgain: document.getElementById('btnAgain')
  };

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var ASIDE_MS = 380;
  var ASIDE_HOLD_MS = 140;
  var PLACE_MS = 400;
  var PLACE_STAGGER = 115;
  var PAIR_PAUSE = 60;
  var SETTLE_MS = 160;
  var EASE = 'cubic-bezier(0.45, 0.05, 0.2, 1)';

  var needsRelayout = false;

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  var PAINTS = [
    { name: 'red', color: '#b3261e' },
    { name: 'blue', color: '#23408f' },
    { name: 'yellow', color: '#c98a00' },
    { name: 'black', color: '#241c17' }
  ];
  var SHAPES = ['dot', 'ring', 'triangle', 'cross'];
  var MARK_ORDER = [5, 14, 3, 8, 12, 1, 10, 7, 0, 11, 6, 13, 9, 4, 15, 2];

  function markFor(id) {
    var n = MARK_ORDER[id];
    var paint = PAINTS[n % PAINTS.length];
    var shape = SHAPES[Math.floor(n / PAINTS.length)];
    return { color: paint.color, shape: shape, name: paint.name + ' ' + shape };
  }

  function seededRandom(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      var x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function stoneLook(seed) {
    var random = seededRandom(seed * 7919 + 101);
    var between = function (min, max) {
      return min + (max - min) * random();
    };

    var radii = [];
    for (var i = 0; i < 8; i++) {
      radii.push(Math.round(between(38, 62)) + '%');
    }

    var flecks = [];
    var fleckCount = 3 + Math.floor(random() * 3);
    for (var f = 0; f < fleckCount; f++) {
      var x = between(14, 86).toFixed(0);
      var y = between(14, 86).toFixed(0);
      var size = between(0.5, 1.1).toFixed(2);
      var alpha = between(0.14, 0.32).toFixed(2);
      flecks.push(
        'radial-gradient(circle at ' + x + '% ' + y + '%, rgba(98,82,68,' + alpha + ') 0, ' +
        'rgba(98,82,68,' + alpha + ') ' + size + 'px, transparent ' + (Number(size) + 0.9).toFixed(2) + 'px)'
      );
    }

    var warmth = random();
    return {
      w: between(0.9, 1.06).toFixed(3),
      h: between(0.74, 0.88).toFixed(3),
      rot: between(-14, 14).toFixed(1) + 'deg',
      shape: radii.slice(0, 4).join(' ') + ' / ' + radii.slice(4).join(' '),
      flecks: flecks.join(', '),
      toneA: warmth > 0.5 ? '#f8f4ec' : '#f4f2ee',
      toneB: warmth > 0.5 ? '#ddd3c3' : '#d6d2ca'
    };
  }

  function buildStones() {
    el.stones.textContent = '';
    view.clear();

    state.stones.forEach(function (stone) {
      var look = stoneLook(stone.id);
      var mark = markFor(stone.id);

      var node = document.createElement('div');
      node.className = 'stone';
      node.setAttribute('role', 'img');

      var body = document.createElement('span');
      body.className = 'stone__body';
      body.style.setProperty('--w', look.w);
      body.style.setProperty('--h', look.h);
      body.style.setProperty('--rot', look.rot);
      body.style.setProperty('--shape', look.shape);
      body.style.setProperty('--flecks', look.flecks);
      body.style.setProperty('--tone-a', look.toneA);
      body.style.setProperty('--tone-b', look.toneB);
      body.style.setProperty('--i', String(stone.originalPosition));

      var paint = document.createElement('span');
      paint.className = 'stone__mark stone__mark--' + mark.shape;
      paint.style.setProperty('--paint', mark.color);

      body.appendChild(paint);
      node.appendChild(body);
      view.set(stone.id, node);
      el.stones.appendChild(node);
    });
  }

  function measure() {
    var width = el.board.clientWidth;
    var height = el.board.clientHeight;
    var top = 40;
    var bottom = 16;
    var rowHeight = (height - top - bottom) / PER_LINE;
    var size = Math.max(20, Math.min(46, rowHeight * 0.8, width * 0.125));

    return {
      size: size,
      rowHeight: rowHeight,
      top: top,
      lineX: [width * 0.27, width * 0.73],

      asideX: [width / 2 - size * 0.62, width / 2 + size * 0.62]
    };
  }

  function rowY(geometry, place) {
    return geometry.top + geometry.rowHeight * (PER_LINE - 1 - place + 0.5);
  }

  function moveStone(id, x, y, duration) {
    var node = view.get(id);
    node.style.transition = duration ? 'transform ' + duration + 'ms ' + EASE : 'none';
    node.style.transform = 'translate3d(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px, 0)';
  }

  function eachPlace(layout, callback) {
    [LEFT, RIGHT].forEach(function (side) {
      layout[side].forEach(function (id, place) {
        callback(id, side, place);
      });
    });
  }

  function placeAll() {
    var geometry = measure();
    el.board.style.setProperty('--stone', geometry.size.toFixed(1) + 'px');
    eachPlace(state.currentLayout, function (id, side, place) {
      moveStone(id, geometry.lineX[side], rowY(geometry, place), 0);
    });
  }

  function labelStones() {
    eachPlace(state.currentLayout, function (id, side, place) {
      view.get(id).setAttribute(
        'aria-label',
        (side === LEFT ? 'Left' : 'Right') + ' line, ' + (place + 1) + ' from the bottom: ' + markFor(id).name
      );
    });
  }

  function animateRelay(fromLayout, hand, toLayout) {
    var geometry = measure();
    var target = new Map();
    eachPlace(toLayout, function (id, side, place) {
      target.set(id, { x: geometry.lineX[side], y: rowY(geometry, place) });
    });

    if (reducedMotion.matches) {
      hand.forEach(function (id) {
        moveStone(id, target.get(id).x, target.get(id).y, 320);
      });
      return wait(360);
    }

    eachPlace(fromLayout, function (id, side, place) {
      moveStone(id, geometry.asideX[side], rowY(geometry, place), ASIDE_MS);
    });

    return wait(ASIDE_MS + ASIDE_HOLD_MS)
      .then(function () {
        var lastStart = 0;
        hand.forEach(function (id, k) {
          var node = view.get(id);
          var start = k * PLACE_STAGGER + Math.floor(k / 2) * PAIR_PAUSE;
          lastStart = start;

          setTimeout(function () {
            node.style.zIndex = String(100 + k);
            node.classList.add('is-lifted');
            moveStone(id, target.get(id).x, target.get(id).y, PLACE_MS);
          }, start);

          setTimeout(function () {
            node.classList.remove('is-lifted');
          }, start + PLACE_MS * 0.62);
        });
        return wait(lastStart + PLACE_MS + SETTLE_MS);
      })
      .then(function () {
        hand.forEach(function (id) {
          view.get(id).style.zIndex = '';
        });
      });
  }

  function setPrompt(text, dramatic) {
    el.prompt.classList.remove('is-swap');
    el.prompt.classList.toggle('is-dramatic', Boolean(dramatic));
    el.prompt.textContent = text;
    void el.prompt.offsetWidth;
    el.prompt.classList.add('is-swap');
  }

  function setNote(text) {
    el.note.textContent = text;
  }

  function setBusy(busy) {
    state.busy = busy;
    el.btnLeft.disabled = busy;
    el.btnRight.disabled = busy;
    el.board.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (!busy && needsRelayout) {
      needsRelayout = false;
      placeAll();
    }
  }

  function renderProgress() {
    var label = 'CHOOSE YOUR STONE';
    if (state.phase === 'ask') {
      label = 'ROUND ' + (state.currentRound + 1) + ' OF ' + ROUNDS;
    } else if (state.phase === 'reveal') {
      label = 'STONE FOUND';
    }
    el.progressLabel.textContent = label;

    el.pips.forEach(function (pip, index) {
      var done = state.phase === 'reveal' || (state.phase === 'ask' && index < state.currentRound);
      var current = state.phase === 'ask' && index === state.currentRound;
      pip.classList.toggle('is-done', done);
      pip.classList.toggle('is-current', current);
    });
  }

  function renderPhase() {
    el.game.setAttribute('data-phase', state.phase);
    el.groupThink.hidden = state.phase !== 'think';
    el.groupAsk.hidden = state.phase !== 'ask';
    el.groupReveal.hidden = state.phase !== 'reveal';
    renderProgress();
  }

  function startAsking() {
    if (state.phase !== 'think' || state.busy) {
      return;
    }
    state.phase = 'ask';
    state.currentRound = 0;
    state.answers = [];

    renderPhase();
    setPrompt('Which line is your stone in?');
    setNote('Just the line. Don\'t tell me which stone.');
    setBusy(false);
  }

  function answerLine(side) {
    if (state.phase !== 'ask' || state.busy) {
      return;
    }
    setBusy(true);
    state.answers.push(side);

    if (state.currentRound === ROUNDS - 1) {
      reveal(side);
      return;
    }

    var relayIndex = state.currentRound;
    var fromLayout = state.currentLayout;
    var next = Trick.relay(fromLayout, side, relayIndex);

    setPrompt('Watch your stone…');
    setNote('');

    animateRelay(fromLayout, next.hand, next.layout).then(function () {
      state.currentLayout = next.layout;
      state.currentRound += 1;
      labelStones();
      renderProgress();
      setPrompt('Which line is your stone in now?');
      setBusy(false);
    });
  }

  function reveal(lastSide) {
    var found = Trick.findStone(state.currentLayout, lastSide);
    state.foundStone = found;

    setPrompt('Let me think…');
    setNote('');

    wait(1000)
      .then(function () {
        state.phase = 'reveal';
        renderPhase();
        setPrompt('I found your stone! 🔮', true);
        return wait(900);
      })
      .then(function () {
        view.forEach(function (node, id) {
          node.classList.toggle('is-found', id === found);
          node.classList.toggle('is-dim', id !== found);
        });
        return wait(1300);
      })
      .then(function () {
        setPrompt('Your stone was found!');
        setNote('The ' + markFor(found).name + '.');
        el.btnAgain.disabled = false;
        setBusy(false);
        el.btnAgain.focus({ preventScroll: true });
      });
  }

  function newGame() {
    state.phase = 'think';
    state.stones = Trick.createStones();
    state.currentLayout = Trick.startingLayout(state.stones);
    state.currentRound = 0;
    state.answers = [];
    state.foundStone = null;
    state.busy = false;

    buildStones();
    placeAll();
    labelStones();

    el.btnAgain.disabled = true;
    renderPhase();
    setPrompt('Pick one stone in your mind.');
    setNote('Remember its mark. Keep it secret.');
  }

  el.btnDone.addEventListener('click', startAsking);
  el.btnLeft.addEventListener('click', function () {
    answerLine(LEFT);
  });
  el.btnRight.addEventListener('click', function () {
    answerLine(RIGHT);
  });
  el.btnAgain.addEventListener('click', function () {
    if (state.phase === 'reveal' && !state.busy) {
      newGame();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (state.phase !== 'ask' || state.busy || event.repeat) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      answerLine(LEFT);
    } else if (event.key === 'ArrowRight') {
      answerLine(RIGHT);
    }
  });

  function onBoardResize() {
    if (state.busy) {
      needsRelayout = true;
    } else {
      placeAll();
    }
  }
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(onBoardResize).observe(el.board);
  } else {
    window.addEventListener('resize', onBoardResize);
  }

  newGame();
})();