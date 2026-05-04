(function () {
  const socket = io();
  const app = document.getElementById("app");

  let state = null;
  let myId = null;
  let pendingName = localStorage.getItem("verbrush.name") || "";
  let numCardsChoice = 20;

  socket.on("connect", () => {
    myId = socket.id;
    render();
  });

  socket.on("state", (s) => {
    state = s;
    render();
  });

  socket.on("notice", (msg) => {
    alert(msg);
  });

  function mePlayer() {
    return state && myId ? state.players.find((p) => p.id === myId) : null;
  }

  function meReferee() {
    return state && myId && state.referee && state.referee.id === myId
      ? state.referee
      : null;
  }

  function myRole() {
    if (mePlayer()) return "player";
    if (meReferee()) return "referee";
    return "spectator";
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function ordinal(n) {
    if (n === 1) return "1st";
    if (n === 2) return "2nd";
    if (n === 3) return "3rd";
    return n + "th";
  }

  function formatPhrase(phrase) {
    const parts = phrase.split(/(\w+\/\w+)/);
    return parts
      .map((part) => {
        if (part.includes("/")) {
          const [a, b] = part.split("/");
          return `<span class="choice">${escapeHtml(a)} / ${escapeHtml(b)}</span>`;
        }
        return escapeHtml(part);
      })
      .join("");
  }

  function brandHTML() {
    return `
      <div class="brand">
        <h1>Verb <em>Rush</em></h1>
        <div class="tagline">Third Person Singular · Speed Game</div>
      </div>
    `;
  }

  function rulesHTML() {
    return `
      <div class="rules">
        <p>A phrase appears with two choices: <strong>with S</strong> or <strong>no S</strong>. Pick the right one as fast as you can.</p>
        <div class="scoring">
          <span><strong>+2</strong> first correct</span>
          <span><strong>+1</strong> second correct</span>
          <span><strong>−1</strong> wrong answer</span>
        </div>
      </div>
    `;
  }

  function refereeBadgeHTML() {
    if (!state.referee) return "";
    const name = escapeHtml(state.referee.name);
    const isMe = state.referee.id === myId;
    return `
      <div class="referee-badge ${isMe ? "me" : ""}">
        <span class="referee-tag">Referee</span>
        <span class="referee-name">${name}${isMe ? " · you" : ""}</span>
      </div>
    `;
  }

  function slotsHTML() {
    const slots = [];
    for (let i = 0; i < 4; i++) {
      const player = state.players.find((p) => p.slot === i);
      if (player) {
        const isMe = player.id === myId;
        slots.push(`
          <div class="slot filled ${isMe ? "me" : ""}" style="--slot-color:${player.color}">
            <div class="slot-dot"></div>
            <div class="slot-name">${escapeHtml(player.name)}</div>
            ${isMe ? `<div class="slot-tag">You</div>` : ""}
          </div>
        `);
      } else {
        slots.push(`
          <div class="slot empty">
            <div class="slot-dot"></div>
            <div class="slot-name">Waiting…</div>
          </div>
        `);
      }
    }
    return `<div class="slots">${slots.join("")}</div>`;
  }

  function refereeSlotHTML() {
    if (state.referee) {
      const isMe = state.referee.id === myId;
      return `
        <div class="ref-slot filled ${isMe ? "me" : ""}">
          <div class="ref-slot-tag">Referee</div>
          <div class="ref-slot-name">${escapeHtml(state.referee.name)}${
        isMe ? " · you" : ""
      }</div>
        </div>
      `;
    }
    return `
      <div class="ref-slot empty">
        <div class="ref-slot-tag">Referee</div>
        <div class="ref-slot-name">No referee — game can't start</div>
      </div>
    `;
  }

  /* ---------- Screens ---------- */

  function renderJoinOrSpectator() {
    const playersFull = state.players.length >= 4;
    const refereeTaken = !!state.referee;
    const inProgress = state.status !== "lobby";

    const canJoinPlayer = !playersFull && !inProgress;
    const canJoinReferee = !refereeTaken;

    let formBlock;
    if (!canJoinPlayer && !canJoinReferee) {
      const reason = inProgress ? "A game is in progress." : "The game is full.";
      formBlock = `
        <div class="notice">
          <span class="spectator-tag">Spectator</span>
          <div>${reason} You can watch live.</div>
        </div>
      `;
    } else {
      formBlock = `
        <div class="role-choice">
          <input
            type="text"
            id="name-input"
            placeholder="Your name"
            value="${escapeHtml(pendingName)}"
            maxlength="20"
            autocomplete="off"
            autofocus
          />
          <div class="role-buttons">
            <button id="join-player-btn" ${canJoinPlayer ? "" : "disabled"}>
              Join as player
              <span class="btn-sub">${state.players.length} / 4 seats</span>
            </button>
            <button id="join-referee-btn" class="ghost" ${canJoinReferee ? "" : "disabled"}>
              Join as referee
              <span class="btn-sub">${
                refereeTaken ? "already taken" : "controls the game"
              }</span>
            </button>
          </div>
        </div>
      `;
    }

    app.innerHTML = `
      ${brandHTML()}
      <div class="panel">
        ${rulesHTML()}
        <div class="section-title">Players (${state.players.length} / 4)</div>
        ${slotsHTML()}
        <div class="section-title" style="margin-top:18px">Referee</div>
        ${refereeSlotHTML()}
        ${formBlock}
      </div>
      ${
        !canJoinPlayer && !canJoinReferee && state.status !== "lobby"
          ? `<div style="height:24px"></div>` + gameStageHTML({ role: "spectator" })
          : ""
      }
    `;

    const input = document.getElementById("name-input");
    const playerBtn = document.getElementById("join-player-btn");
    const refBtn = document.getElementById("join-referee-btn");

    function submitRole(role) {
      const name = input ? input.value.trim() : "";
      if (!name) {
        if (input) input.focus();
        return;
      }
      pendingName = name;
      localStorage.setItem("verbrush.name", name);
      socket.emit("join", { role, name });
    }

    if (playerBtn && !playerBtn.disabled) {
      playerBtn.addEventListener("click", () => submitRole("player"));
    }
    if (refBtn && !refBtn.disabled) {
      refBtn.addEventListener("click", () => submitRole("referee"));
    }
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (canJoinPlayer) submitRole("player");
          else if (canJoinReferee) submitRole("referee");
        }
      });
    }
  }

  function renderLobby() {
    const role = myRole();
    const ready = state.players.length >= 1 && !!state.referee;
    const isRef = role === "referee";
    const full = state.players.length === 4;

    let statusLine;
    if (!state.referee) {
      statusLine = "Waiting for a referee…";
    } else if (state.players.length === 0) {
      statusLine = "Waiting for at least one player…";
    } else if (full) {
      statusLine = isRef
        ? "Everyone's here. You can start the game."
        : "Everyone's here. The referee will start the game.";
    } else {
      const n = state.players.length;
      const s = n > 1 ? "s" : "";
      statusLine = isRef
        ? `${n} player${s} ready — you can start now or wait for more.`
        : `${n} player${s} connected — the referee can start whenever.`;
    }

    let actions;
    if (isRef) {
      actions = `
        <div class="lobby-actions">
          <div class="config">
            <label for="num-cards">Cards</label>
            <select id="num-cards">
              <option value="10" ${numCardsChoice === 10 ? "selected" : ""}>10</option>
              <option value="20" ${numCardsChoice === 20 ? "selected" : ""}>20</option>
              <option value="30" ${numCardsChoice === 30 ? "selected" : ""}>30</option>
              <option value="50" ${numCardsChoice === 50 ? "selected" : ""}>50</option>
            </select>
          </div>
          <div class="grow"></div>
          <button class="ghost" id="leave-btn">Leave role</button>
          <button id="start-btn" ${ready ? "" : "disabled"}>Start game</button>
        </div>
      `;
    } else {
      actions = `
        <div class="lobby-actions">
          <div class="grow"></div>
          <button class="ghost" id="leave-btn">Leave</button>
        </div>
      `;
    }

    app.innerHTML = `
      ${brandHTML()}
      <div class="panel">
        ${rulesHTML()}
        <div class="section-title">Players (${state.players.length} / 4)</div>
        ${slotsHTML()}
        <div class="section-title" style="margin-top:18px">Referee</div>
        ${refereeSlotHTML()}
        <div class="lobby-status">${statusLine}</div>
        ${actions}
      </div>
    `;

    const numCards = document.getElementById("num-cards");
    if (numCards) {
      numCards.addEventListener("change", (e) => {
        numCardsChoice = parseInt(e.target.value, 10);
      });
    }
    document.getElementById("leave-btn").addEventListener("click", () => {
      socket.emit("leave");
    });
    const startBtn = document.getElementById("start-btn");
    if (startBtn && !startBtn.disabled) {
      startBtn.addEventListener("click", () => {
        socket.emit("start", numCardsChoice);
      });
    }
  }

  /* ---------- Live leaderboard ---------- */

  function computeRanks(players) {
    const sorted = [...players].sort(
      (a, b) => b.score - a.score || a.slot - b.slot
    );
    const ranks = new Map();
    let lastScore = null;
    let rank = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].score !== lastScore) {
        rank = i + 1;
        lastScore = sorted[i].score;
      }
      ranks.set(sorted[i].id, rank);
    }
    return { sorted, ranks };
  }

  function scoreboardHTML() {
    const players = state.players.slice();
    if (players.length === 0) return "";

    const showResult = state.status === "result";
    const correctAnswer =
      state.cards[state.cardIndex] && state.cards[state.cardIndex].answer;

    const { sorted, ranks } = computeRanks(players);

    const previousPlayers = players.map((p) => ({
      ...p,
      score: showResult ? p.score - (state.roundDeltas[p.slot] || 0) : p.score,
    }));
    const { ranks: prevRanks } = computeRanks(previousPlayers);

    const cards = sorted.map((player) => {
      const isMe = player.id === myId;
      const answered = state.roundAnswers.find((a) => a.playerId === player.id);
      let extraClass = "";
      if (showResult && answered) {
        extraClass = answered.answer === correctAnswer ? "correct" : "wrong";
      }

      const rank = ranks.get(player.id);
      const prevRank = prevRanks.get(player.id);
      const rankDelta = prevRank - rank;
      let arrow = "";
      if (showResult && rankDelta > 0) {
        arrow = `<span class="rank-arrow up">↑</span>`;
      } else if (showResult && rankDelta < 0) {
        arrow = `<span class="rank-arrow down">↓</span>`;
      }
      const leaderClass = rank === 1 ? " leader" : "";

      const delta = state.roundDeltas[player.slot] || 0;
      let deltaHTML = "";
      if (showResult && delta !== 0) {
        const cls = delta > 0 ? "up" : "down";
        const sign = delta > 0 ? `+${delta}` : delta;
        deltaHTML = `<div class="score-delta ${cls}">${sign}</div>`;
      }

      const answeredHTML =
        state.status === "playing" && answered
          ? `<div class="score-answered">Answered</div>`
          : "";

      return `
        <div class="score-card${leaderClass} ${isMe ? "me" : ""} ${extraClass}" style="--score-color:${player.color}">
          <div class="rank-pill">
            <span class="rank-num">${ordinal(rank)}</span>
            ${arrow}
          </div>
          <div class="score-name">${escapeHtml(player.name)}${isMe ? " · you" : ""}</div>
          <div class="score-num">${player.score}</div>
          ${deltaHTML}
          ${answeredHTML}
        </div>
      `;
    });

    const n = sorted.length;
    const maxW = n * 210 + (n - 1) * 10;
    return `<div class="scoreboard" style="max-width: ${maxW}px">${cards.join("")}</div>`;
  }

  function gameStageHTML({ role }) {
    const phase = state.status;
    const card = state.cards[state.cardIndex];
    const correctAnswer = card ? card.answer : null;
    const showResult = phase === "result";
    const isReferee = role === "referee";
    const isPlayer = role === "player";
    const player = mePlayer();
    const myAnswer =
      player && state.roundAnswers.find((a) => a.playerId === player.id);

    let stageContent = "";
    let stageClass = "";

    if (phase === "waiting") {
      let txt;
      if (isReferee) txt = "Ready? Reveal the next phrase.";
      else if (isPlayer) txt = "Waiting for the referee to reveal the next phrase…";
      else txt = "Waiting for the next phrase…";

      stageContent = `
        <div class="waiting-text">${txt}</div>
        ${isReferee ? `<button id="reveal-btn">Reveal phrase</button>` : ""}
      `;
    } else if (phase === "countdown") {
      stageContent = `<div class="countdown">${state.countdown}</div>`;
    } else if (phase === "playing" || phase === "result") {
      if (showResult) {
        stageClass = correctAnswer === "S" ? "correct-glow" : "wrong-glow";
      }
      const phraseHTML = card ? formatPhrase(card.phrase) : "";
      let revealHTML = "";
      if (showResult) {
        const tag =
          correctAnswer === "S"
            ? `<span class="tag s">with S</span>`
            : `<span class="tag no-s">no S</span>`;
        revealHTML = `<div class="answer-reveal">Answer:${tag}</div>`;
      }
      stageContent = `
        <div class="phrase">${phraseHTML}</div>
        ${revealHTML}
      `;
    }

    const counter =
      state.cards.length > 0
        ? `<div class="card-counter">Card ${state.cardIndex + 1} of ${state.cards.length}</div>`
        : "";

    let actionsHTML = "";
    if (isPlayer && phase === "playing") {
      const disabled = !!myAnswer;
      actionsHTML = `
        <div class="actions">
          <button class="action-btn" data-answer="S" ${disabled ? "disabled" : ""}>
            <span class="glyph">with</span>S
          </button>
          <button class="action-btn" data-answer="NO S" ${disabled ? "disabled" : ""}>
            <span class="glyph">no</span>S
          </button>
        </div>
        ${disabled ? `<div class="actions-hint">Waiting for others…</div>` : ""}
      `;
    }

    let nextHTML = "";
    if (showResult) {
      const ranking = [...state.roundAnswers]
        .map((a) => {
          const p = state.players.find((pp) => pp.slot === a.slot);
          return { ...a, name: p ? p.name : "—", color: p ? p.color : "#888" };
        })
        .sort((x, y) => x.time - y.time);

      const rows = ranking
        .map((r, i) => {
          const correct = r.answer === correctAnswer;
          const delta = state.roundDeltas[r.slot];
          const deltaCls = delta > 0 ? "up" : delta < 0 ? "down" : "";
          const deltaTxt = delta > 0 ? `+${delta}` : delta;
          return `
            <div class="rank-row" style="--rank-color:${r.color}">
              <div class="rank-num">${i + 1}.</div>
              <div class="rank-name">${escapeHtml(r.name)}</div>
              <div class="rank-answer ${correct ? "correct" : "wrong"}">${
            r.answer === "S" ? "with S" : "no S"
          } ${correct ? "✓" : "✗"}</div>
              <div class="rank-delta ${deltaCls}">${deltaTxt}</div>
            </div>
          `;
        })
        .join("");

      const isLast = state.cardIndex + 1 >= state.cards.length;
      nextHTML = `
        <div class="ranking">${rows}</div>
        ${
          isReferee
            ? `<button id="next-btn">${isLast ? "See results" : "Next card"}</button>`
            : `<div class="actions-hint">${
                isLast
                  ? "The referee will show the results…"
                  : "The referee will move on…"
              }</div>`
        }
      `;
    }

    return `
      ${refereeBadgeHTML()}
      ${scoreboardHTML()}
      ${counter}
      <div class="stage ${stageClass}">${stageContent}</div>
      ${actionsHTML}
      ${nextHTML}
    `;
  }

  function renderGame() {
    const role = myRole();
    app.innerHTML = `
      ${brandHTML()}
      ${gameStageHTML({ role })}
    `;

    const revealBtn = document.getElementById("reveal-btn");
    if (revealBtn) {
      revealBtn.addEventListener("click", () => socket.emit("reveal"));
    }

    document.querySelectorAll(".action-btn[data-answer]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const answer = btn.getAttribute("data-answer");
        socket.emit("answer", answer);
      });
    });

    const nextBtn = document.getElementById("next-btn");
    if (nextBtn) {
      nextBtn.addEventListener("click", () => socket.emit("next"));
    }
  }

  function renderGameOver() {
    const role = myRole();
    const ranking = [...state.players].sort((a, b) => b.score - a.score);
    const rows = ranking
      .map((p, i) => {
        const isFirst = i === 0;
        return `
          <div class="podium-row ${isFirst ? "first" : ""}" style="--row-color:${p.color}">
            <div class="podium-rank">${ordinal(i + 1)}</div>
            <div class="podium-name">${escapeHtml(p.name)}</div>
            <div class="podium-score">${p.score} <span style="font-size:14px;color:var(--muted);font-style:italic">pts</span></div>
          </div>
        `;
      })
      .join("");

    app.innerHTML = `
      ${brandHTML()}
      <div class="panel panel-wide">
        ${refereeBadgeHTML()}
        <div class="section-title" style="text-align:center">Game over</div>
        <div class="podium">${rows}</div>
        <div class="gameover-actions">
          ${
            role === "referee"
              ? `<button id="reset-btn">New game</button>`
              : `<div class="actions-hint">The referee can start a new game.</div>`
          }
        </div>
      </div>
    `;

    const resetBtn = document.getElementById("reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => socket.emit("reset"));
    }
  }

  function render() {
    if (!state) {
      app.innerHTML = `<div class="loading">Connecting…</div>`;
      return;
    }

    const role = myRole();

    if (role === "spectator") {
      renderJoinOrSpectator();
      return;
    }

    if (state.status === "lobby") {
      renderLobby();
      return;
    }

    if (state.status === "gameover") {
      renderGameOver();
      return;
    }

    renderGame();
  }

  /* ---------- Rules modal ---------- */

  function rulesModalHTML() {
    return `
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <button class="modal-close" id="rules-modal-close" aria-label="Close">×</button>
        <h2 class="modal-title" id="rules-title">Verb <em>Rush</em></h2>
        <p class="modal-lead">Game rules</p>

        <div class="modal-section">
          <h3>The goal</h3>
          <p>
            A speed game on the third person singular in English. For each phrase, decide
            whether the verb takes an <strong>-s</strong> or not, as fast as you can.
          </p>
        </div>

        <div class="modal-section">
          <h3>Roles</h3>
          <div class="modal-roles">
            <div class="modal-role">
              <span class="modal-role-tag referee">Referee</span>
              <span class="modal-role-text">Controls the game: reveals phrases and moves to the next. Doesn't play. One referee per game.</span>
            </div>
            <div class="modal-role">
              <span class="modal-role-tag player">Player</span>
              <span class="modal-role-text">Up to 4 seats. Each player answers <strong>"with S"</strong> or <strong>"no S"</strong> for each phrase. The game can start with at least one player.</span>
            </div>
            <div class="modal-role">
              <span class="modal-role-tag spectator">Spectator</span>
              <span class="modal-role-text">If you arrive when the game is full, you can watch live without playing.</span>
            </div>
          </div>
        </div>

        <div class="modal-section">
          <h3>A round</h3>
          <ol>
            <li>The referee clicks <strong>Reveal phrase</strong>.</li>
            <li>Countdown 3 → 2 → 1.</li>
            <li>The phrase appears with two highlighted choices (e.g. "He <em>play / plays</em> football").</li>
            <li>Each player clicks as fast as possible on <strong>with S</strong> or <strong>no S</strong>.</li>
            <li>Once all players have answered, the correct answer and round ranking appear.</li>
            <li>The referee moves to the next card.</li>
          </ol>
        </div>

        <div class="modal-section">
          <h3>Scoring</h3>
          <div class="scoring-grid">
            <span class="pts up">+2</span>
            <span class="desc">to the 1<sup>st</sup> player to answer correctly</span>
            <span class="pts up">+1</span>
            <span class="desc">to the 2<sup>nd</sup> player to answer correctly</span>
            <span class="pts">0</span>
            <span class="desc">to the 3<sup>rd</sup> and 4<sup>th</sup> correct answers</span>
            <span class="pts down">−1</span>
            <span class="desc">for any wrong answer, regardless of speed</span>
          </div>
        </div>

        <div class="modal-section">
          <h3>Live leaderboard</h3>
          <p>
            The scoreboard reorders itself in real time after each round.
            <span style="color: var(--good)">↑</span> means a player just climbed,
            <span style="color: var(--bad)">↓</span> means they fell.
            Watch the rankings flip — every wrong answer can drop you a spot.
          </p>
        </div>

        <div class="modal-section">
          <h3>Tip</h3>
          <p class="modal-tip">
            Speed pays, but a wrong answer costs. If two players have already
            answered correctly, taking 0 is better than −1.
          </p>
        </div>

        <div class="modal-section">
          <h3>End of game</h3>
          <p>
            A game lasts as many cards as the referee chose (10, 20, 30, or 50).
            At the end, the final ranking appears. The referee can start a new game.
          </p>
        </div>
      </div>
    `;
  }

  function openRules() {
    if (document.getElementById("rules-modal")) return;
    const modal = document.createElement("div");
    modal.id = "rules-modal";
    modal.className = "modal-backdrop";
    modal.innerHTML = rulesModalHTML();
    document.body.appendChild(modal);

    function onKey(e) {
      if (e.key === "Escape") closeRules();
    }
    function onBackdropClick(e) {
      if (e.target === modal) closeRules();
    }

    modal._onKey = onKey;
    document.addEventListener("keydown", onKey);
    modal.addEventListener("click", onBackdropClick);
    document
      .getElementById("rules-modal-close")
      .addEventListener("click", closeRules);

    const closeBtn = document.getElementById("rules-modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeRules() {
    const modal = document.getElementById("rules-modal");
    if (!modal) return;
    if (modal._onKey) document.removeEventListener("keydown", modal._onKey);
    modal.remove();
  }

  const rulesBtn = document.getElementById("rules-btn");
  if (rulesBtn) {
    rulesBtn.addEventListener("click", openRules);
  }

  render();
})();
