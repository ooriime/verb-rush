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
        <p>Une phrase apparaît avec deux choix : avec <strong>S</strong> ou sans. Choisis le bon, le plus vite possible.</p>
        <div class="scoring">
          <span><strong>+2</strong> au 1<sup>er</sup> bon</span>
          <span><strong>+1</strong> au 2<sup>ème</sup> bon</span>
          <span><strong>−1</strong> par mauvaise réponse</span>
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
        <span class="referee-tag">Arbitre</span>
        <span class="referee-name">${name}${isMe ? " · toi" : ""}</span>
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
            ${isMe ? `<div class="slot-tag">Toi</div>` : ""}
          </div>
        `);
      } else {
        slots.push(`
          <div class="slot empty">
            <div class="slot-dot"></div>
            <div class="slot-name">En attente…</div>
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
          <div class="ref-slot-tag">Arbitre</div>
          <div class="ref-slot-name">${escapeHtml(state.referee.name)}${
        isMe ? " · toi" : ""
      }</div>
        </div>
      `;
    }
    return `
      <div class="ref-slot empty">
        <div class="ref-slot-tag">Arbitre</div>
        <div class="ref-slot-name">Aucun arbitre — la partie ne peut pas démarrer</div>
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
      const reason = inProgress
        ? "Une partie est en cours."
        : "La partie est complète.";
      formBlock = `
        <div class="notice">
          <span class="spectator-tag">Spectateur</span>
          <div>${reason} Tu peux suivre la partie en direct.</div>
        </div>
      `;
    } else {
      formBlock = `
        <div class="role-choice">
          <input
            type="text"
            id="name-input"
            placeholder="Ton prénom"
            value="${escapeHtml(pendingName)}"
            maxlength="20"
            autocomplete="off"
            autofocus
          />
          <div class="role-buttons">
            <button id="join-player-btn" ${canJoinPlayer ? "" : "disabled"}>
              Rejoindre comme joueur
              <span class="btn-sub">${state.players.length} / 4 sièges</span>
            </button>
            <button id="join-referee-btn" class="ghost" ${canJoinReferee ? "" : "disabled"}>
              Devenir l'arbitre
              <span class="btn-sub">${
                refereeTaken ? "déjà pris" : "pilote la partie"
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
        <div class="section-title">Joueurs (${state.players.length} / 4)</div>
        ${slotsHTML()}
        <div class="section-title" style="margin-top:18px">Arbitrage</div>
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
      statusLine = "En attente d'un arbitre…";
    } else if (state.players.length === 0) {
      statusLine = "En attente d'au moins un joueur…";
    } else if (full) {
      statusLine = isRef
        ? "Tout le monde est là, tu peux lancer la partie."
        : "Tout le monde est là, l'arbitre va lancer la partie.";
    } else {
      statusLine = isRef
        ? `${state.players.length} joueur${state.players.length > 1 ? "s" : ""} prêt${state.players.length > 1 ? "s" : ""} — tu peux lancer dès maintenant ou attendre les autres.`
        : `${state.players.length} joueur${state.players.length > 1 ? "s" : ""} connecté${state.players.length > 1 ? "s" : ""} — l'arbitre peut lancer la partie quand il veut.`;
    }

    let actions;
    if (isRef) {
      actions = `
        <div class="lobby-actions">
          <div class="config">
            <label for="num-cards">Cartes</label>
            <select id="num-cards">
              <option value="10" ${numCardsChoice === 10 ? "selected" : ""}>10</option>
              <option value="20" ${numCardsChoice === 20 ? "selected" : ""}>20</option>
              <option value="30" ${numCardsChoice === 30 ? "selected" : ""}>30</option>
              <option value="50" ${numCardsChoice === 50 ? "selected" : ""}>50</option>
            </select>
          </div>
          <div class="grow"></div>
          <button class="ghost" id="leave-btn">Quitter le rôle</button>
          <button id="start-btn" ${ready ? "" : "disabled"}>Lancer la partie</button>
        </div>
      `;
    } else {
      actions = `
        <div class="lobby-actions">
          <div class="grow"></div>
          <button class="ghost" id="leave-btn">Quitter</button>
        </div>
      `;
    }

    app.innerHTML = `
      ${brandHTML()}
      <div class="panel">
        ${rulesHTML()}
        <div class="section-title">Joueurs (${state.players.length} / 4)</div>
        ${slotsHTML()}
        <div class="section-title" style="margin-top:18px">Arbitrage</div>
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

  function scoreboardHTML() {
    const players = state.players.slice().sort((a, b) => a.slot - b.slot);
    const n = Math.max(1, players.length);
    const correctAnswer =
      state.cards[state.cardIndex] && state.cards[state.cardIndex].answer;
    const showResult = state.status === "result";

    const cards = players.map((player) => {
      const isMe = player.id === myId;
      const answered = state.roundAnswers.find((a) => a.playerId === player.id);
      let extraClass = "";
      if (showResult && answered) {
        extraClass = answered.answer === correctAnswer ? "correct" : "wrong";
      }

      const delta = state.roundDeltas[player.slot] || 0;
      let deltaHTML = "";
      if (showResult) {
        const cls = delta > 0 ? "up" : delta < 0 ? "down" : "zero";
        const sign = delta > 0 ? `+${delta}` : delta;
        deltaHTML = `<div class="score-delta ${cls}">${sign}</div>`;
      }

      const answeredHTML =
        state.status === "playing" && answered
          ? `<div class="score-answered">A répondu</div>`
          : "";

      return `
        <div class="score-card ${isMe ? "me" : ""} ${extraClass}" style="--score-color:${player.color}">
          <div class="score-name">${escapeHtml(player.name)}${isMe ? " · toi" : ""}</div>
          <div class="score-num">${player.score}</div>
          ${deltaHTML}
          ${answeredHTML}
        </div>
      `;
    });

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
      if (isReferee) txt = "Prêt ? Révèle la prochaine phrase.";
      else if (isPlayer) txt = "L'arbitre va révéler la prochaine phrase…";
      else txt = "En attente du prochain mot…";

      stageContent = `
        <div class="waiting-text">${txt}</div>
        ${isReferee ? `<button id="reveal-btn">Révéler la phrase</button>` : ""}
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
            ? `<span class="tag s">avec S</span>`
            : `<span class="tag no-s">sans S</span>`;
        revealHTML = `<div class="answer-reveal">Réponse${tag}</div>`;
      }
      stageContent = `
        <div class="phrase">${phraseHTML}</div>
        ${revealHTML}
      `;
    }

    const counter =
      state.cards.length > 0
        ? `<div class="card-counter">Carte ${state.cardIndex + 1} sur ${state.cards.length}</div>`
        : "";

    let actionsHTML = "";
    if (isPlayer && phase === "playing") {
      const disabled = !!myAnswer;
      actionsHTML = `
        <div class="actions">
          <button class="action-btn" data-answer="S" ${disabled ? "disabled" : ""}>
            <span class="glyph">avec</span>S
          </button>
          <button class="action-btn" data-answer="NO S" ${disabled ? "disabled" : ""}>
            <span class="glyph">sans</span>S
          </button>
        </div>
        ${disabled ? `<div class="actions-hint">En attente des autres…</div>` : ""}
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
            r.answer === "S" ? "avec S" : "sans S"
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
            ? `<button id="next-btn">${
                isLast ? "Voir les résultats" : "Carte suivante"
              }</button>`
            : `<div class="actions-hint">${
                isLast
                  ? "L'arbitre va afficher les résultats…"
                  : "L'arbitre passe à la suivante…"
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
            <div class="podium-rank">${i + 1}.</div>
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
        <div class="section-title" style="text-align:center">Partie terminée</div>
        <div class="podium">${rows}</div>
        <div class="gameover-actions">
          ${
            role === "referee"
              ? `<button id="reset-btn">Nouvelle partie</button>`
              : `<div class="actions-hint">L'arbitre peut relancer une partie.</div>`
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
      app.innerHTML = `<div class="loading">Connexion…</div>`;
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
        <button class="modal-close" id="rules-modal-close" aria-label="Fermer">×</button>
        <h2 class="modal-title" id="rules-title">Verb <em>Rush</em></h2>
        <p class="modal-lead">Règles du jeu</p>

        <div class="modal-section">
          <h3>Le but</h3>
          <p>
            Un jeu de rapidité sur la troisième personne du singulier en anglais.
            Pour chaque phrase, devine si le verbe doit prendre un <strong>-s</strong> ou non,
            le plus vite possible.
          </p>
        </div>

        <div class="modal-section">
          <h3>Les rôles</h3>
          <div class="modal-roles">
            <div class="modal-role">
              <span class="modal-role-tag referee">Arbitre</span>
              <span class="modal-role-text">Pilote la partie : il révèle les phrases et passe à la suivante. Il ne joue pas. Un seul arbitre par partie.</span>
            </div>
            <div class="modal-role">
              <span class="modal-role-tag player">Joueur</span>
              <span class="modal-role-text">Jusqu'à 4 sièges. Chaque joueur répond avec <strong>« avec S »</strong> ou <strong>« sans S »</strong> à chaque phrase. La partie peut démarrer dès qu'il y a au moins un joueur.</span>
            </div>
            <div class="modal-role">
              <span class="modal-role-tag spectator">Spectateur</span>
              <span class="modal-role-text">Si tu arrives quand la partie est complète, tu peux suivre en direct sans participer.</span>
            </div>
          </div>
        </div>

        <div class="modal-section">
          <h3>Une manche</h3>
          <ol>
            <li>L'arbitre clique sur <strong>Révéler la phrase</strong>.</li>
            <li>Décompte 3 → 2 → 1.</li>
            <li>La phrase apparaît avec deux choix surlignés (ex. « He <em>play / plays</em> football »).</li>
            <li>Chaque joueur clique le plus vite possible sur <strong>avec S</strong> ou <strong>sans S</strong>.</li>
            <li>Quand tous les joueurs ont répondu, la bonne réponse et le classement de la manche s'affichent.</li>
            <li>L'arbitre passe à la carte suivante.</li>
          </ol>
        </div>

        <div class="modal-section">
          <h3>Le score</h3>
          <div class="scoring-grid">
            <span class="pts up">+2</span>
            <span class="desc">au 1<sup>er</sup> joueur à donner la bonne réponse</span>
            <span class="pts up">+1</span>
            <span class="desc">au 2<sup>ème</sup> joueur à donner la bonne réponse</span>
            <span class="pts">0</span>
            <span class="desc">au 3<sup>ème</sup> et 4<sup>ème</sup> bonne réponse</span>
            <span class="pts down">−1</span>
            <span class="desc">par mauvaise réponse, peu importe la rapidité</span>
          </div>
        </div>

        <div class="modal-section">
          <p class="modal-tip">
            La rapidité paye, mais une mauvaise réponse coûte cher.
            Si tu hésites et que deux joueurs ont déjà bien répondu, mieux vaut prendre 0 que −1.
          </p>
        </div>

        <div class="modal-section">
          <h3>Fin de partie</h3>
          <p>
            Une partie dure le nombre de cartes choisi par l'arbitre (10, 20, 30 ou 50).
            À la fin, le classement final s'affiche. L'arbitre peut relancer une nouvelle partie.
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
