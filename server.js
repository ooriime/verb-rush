const path = require("path");
const http = require("http");
const os = require("os");
const express = require("express");
const { Server } = require("socket.io");

const PHRASES = [
  { phrase: "He play/plays football", answer: "S" },
  { phrase: "They work/works at night", answer: "NO S" },
  { phrase: "She eat/eats breakfast", answer: "S" },
  { phrase: "I run/runs every morning", answer: "NO S" },
  { phrase: "My cat sleep/sleeps all day", answer: "S" },
  { phrase: "We study/studies English", answer: "NO S" },
  { phrase: "It rain/rains a lot", answer: "S" },
  { phrase: "The kids swim/swims in the pool", answer: "NO S" },
  { phrase: "Tom drive/drives fast", answer: "S" },
  { phrase: "You dance/dances very well", answer: "NO S" },
  { phrase: "Her mom cook/cooks dinner", answer: "S" },
  { phrase: "My friends sing/sings loudly", answer: "NO S" },
  { phrase: "He watch/watches TV", answer: "S" },
  { phrase: "The students read/reads books", answer: "NO S" },
  { phrase: "She go/goes to school", answer: "S" },
  { phrase: "People think/thinks differently", answer: "NO S" },
  { phrase: "His dog bark/barks at night", answer: "S" },
  { phrase: "I like/likes chocolate", answer: "NO S" },
  { phrase: "The teacher speak/speaks French", answer: "S" },
  { phrase: "They live/lives in Paris", answer: "NO S" },
  { phrase: "Anna write/writes letters", answer: "S" },
  { phrase: "We drink/drinks water", answer: "NO S" },
  { phrase: "It smell/smells good", answer: "S" },
  { phrase: "You know/knows the answer", answer: "NO S" },
  { phrase: "My brother take/takes the bus", answer: "S" },
  { phrase: "The children play/plays outside", answer: "NO S" },
  { phrase: "She brush/brushes her hair", answer: "S" },
  { phrase: "He give/gives presents", answer: "S" },
  { phrase: "My parents buy/buys food", answer: "NO S" },
  { phrase: "The baby cry/cries every night", answer: "S" },
  { phrase: "They come/comes early", answer: "NO S" },
  { phrase: "His sister try/tries hard", answer: "S" },
  { phrase: "I make/makes coffee", answer: "NO S" },
  { phrase: "You and I have/has fun", answer: "NO S" },
  { phrase: "The cat run/runs in the garden", answer: "S" },
  { phrase: "We see/sees our friends", answer: "NO S" },
  { phrase: "She wear/wears a dress", answer: "S" },
  { phrase: "He think/thinks a lot", answer: "S" },
  { phrase: "My teacher explain/explains well", answer: "S" },
  { phrase: "The birds sing/sings in the morning", answer: "NO S" },
  { phrase: "It get/gets cold in winter", answer: "S" },
  { phrase: "They learn/learns new things", answer: "NO S" },
  { phrase: "Her dad drive/drives a big car", answer: "S" },
  { phrase: "You want/wants a dog", answer: "NO S" },
  { phrase: "He clean/cleans his room", answer: "S" },
  { phrase: "The dog eat/eats bones", answer: "S" },
  { phrase: "My mom grow/grows flowers", answer: "S" },
  { phrase: "We visit/visits our family", answer: "NO S" },
  { phrase: "She save/saves money", answer: "S" },
  { phrase: "I walk/walks to school", answer: "NO S" },
];

const COLORS = ["#b8473b", "#2c5a7d", "#5b7f4a", "#c2902c"];
const MAX_PLAYERS = 4;

function createInitialState() {
  return {
    players: [],
    referee: null,
    status: "lobby",
    cards: [],
    cardIndex: 0,
    numCards: 20,
    roundAnswers: [],
    roundDeltas: [0, 0, 0, 0],
    roundStartTime: null,
    countdown: null,
  };
}

function computeDeltas(state) {
  const correctAnswers = state.roundAnswers
    .filter((a) => a.correct)
    .sort((a, b) => a.time - b.time);
  const wrongAnswers = state.roundAnswers.filter((a) => !a.correct);
  const deltas = [0, 0, 0, 0];
  correctAnswers.forEach((a, i) => {
    if (i === 0) deltas[a.slot] = 2;
    else if (i === 1) deltas[a.slot] = 1;
  });
  wrongAnswers.forEach((a) => {
    deltas[a.slot] = -1;
  });
  return deltas;
}

function isReferee(socketId) {
  return !!(state.referee && state.referee.id === socketId);
}

let state = createInitialState();
let countdownInterval = null;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function findFreeSlot() {
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (!state.players.find((p) => p.slot === i)) return i;
  }
  return -1;
}

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server);

function broadcast() {
  io.emit("state", state);
}

io.on("connection", (socket) => {
  socket.emit("state", state);

  socket.on("join", (payload) => {
    const role = payload && payload.role === "referee" ? "referee" : "player";
    const name = String((payload && payload.name) || "").trim().slice(0, 20);

    if (role === "referee") {
      if (state.referee) {
        socket.emit("notice", "A referee is already connected.");
        return;
      }
      if (state.players.find((p) => p.id === socket.id)) {
        socket.emit("notice", "You're already a player. Leave your seat first.");
        return;
      }
      state.referee = { id: socket.id, name: name || "Referee" };
      broadcast();
      return;
    }

    if (state.referee && state.referee.id === socket.id) {
      socket.emit("notice", "You're already the referee. Leave that role first.");
      return;
    }
    if (state.players.find((p) => p.id === socket.id)) return;
    if (state.status !== "lobby") {
      socket.emit("notice", "A game is in progress. Wait until it ends.");
      return;
    }
    if (state.players.length >= MAX_PLAYERS) {
      socket.emit("notice", "The game is full (4 players max).");
      return;
    }
    const slot = findFreeSlot();
    state.players.push({
      id: socket.id,
      name: name || `Player ${slot + 1}`,
      slot,
      color: COLORS[slot],
      score: 0,
    });
    broadcast();
  });

  socket.on("leave", () => {
    if (state.status !== "lobby") return;
    if (state.referee && state.referee.id === socket.id) {
      state.referee = null;
      broadcast();
      return;
    }
    state.players = state.players.filter((p) => p.id !== socket.id);
    broadcast();
  });

  socket.on("start", (numCards) => {
    if (!isReferee(socket.id)) return;
    if (state.players.length < 1) return;
    if (state.status !== "lobby") return;
    const n = Math.max(5, Math.min(50, parseInt(numCards, 10) || 20));
    state.cards = shuffle(PHRASES).slice(0, n);
    state.cardIndex = 0;
    state.numCards = n;
    state.players.forEach((p) => (p.score = 0));
    state.status = "waiting";
    state.roundAnswers = [];
    state.roundDeltas = [0, 0, 0, 0];
    broadcast();
  });

  socket.on("reveal", () => {
    if (!isReferee(socket.id)) return;
    if (state.status !== "waiting") return;
    state.status = "countdown";
    state.countdown = 3;
    broadcast();
    let c = 3;
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      c -= 1;
      if (c <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        state.countdown = null;
        state.status = "playing";
        state.roundAnswers = [];
        state.roundDeltas = [0, 0, 0, 0];
        state.roundStartTime = Date.now();
        broadcast();
      } else {
        state.countdown = c;
        broadcast();
      }
    }, 700);
  });

  socket.on("answer", (answer) => {
    if (state.status !== "playing") return;
    const player = state.players.find((p) => p.id === socket.id);
    if (!player) return;
    if (answer !== "S" && answer !== "NO S") return;
    if (state.roundAnswers.find((a) => a.playerId === socket.id)) return;
    const now = Date.now();
    state.roundAnswers.push({
      playerId: socket.id,
      slot: player.slot,
      answer,
      time: now,
      elapsed: state.roundStartTime ? now - state.roundStartTime : 0,
      correct: null,
    });
    if (state.roundAnswers.length === state.players.length) {
      const correctAnswer = state.cards[state.cardIndex].answer;
      state.roundAnswers.forEach((a) => {
        a.correct = a.answer === correctAnswer;
      });
      state.status = "review";
    }
    broadcast();
  });

  socket.on("toggleAnswer", (playerId) => {
    if (!isReferee(socket.id)) return;
    if (state.status !== "review") return;
    const ans = state.roundAnswers.find((a) => a.playerId === playerId);
    if (!ans) return;
    ans.correct = !ans.correct;
    broadcast();
  });

  socket.on("confirmReview", () => {
    if (!isReferee(socket.id)) return;
    if (state.status !== "review") return;
    const deltas = computeDeltas(state);
    state.players.forEach((p) => {
      p.score += deltas[p.slot];
    });
    state.roundDeltas = deltas;
    state.status = "result";
    broadcast();
  });

  socket.on("next", () => {
    if (!isReferee(socket.id)) return;
    if (state.status !== "result") return;
    if (state.cardIndex + 1 >= state.cards.length) {
      state.status = "gameover";
    } else {
      state.cardIndex += 1;
      state.status = "waiting";
      state.roundAnswers = [];
      state.roundDeltas = [0, 0, 0, 0];
      state.roundStartTime = null;
    }
    broadcast();
  });

  socket.on("reset", () => {
    if (!isReferee(socket.id)) return;
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    const keptPlayers = state.players.map((p, i) => ({
      ...p,
      slot: i,
      color: COLORS[i],
      score: 0,
    }));
    const keptReferee = state.referee;
    state = createInitialState();
    state.players = keptPlayers;
    state.referee = keptReferee;
    broadcast();
  });

  socket.on("disconnect", () => {
    if (state.referee && state.referee.id === socket.id) {
      state.referee = null;
      broadcast();
      return;
    }

    const wasPlayer = state.players.find((p) => p.id === socket.id);
    if (!wasPlayer) return;
    state.players = state.players.filter((p) => p.id !== socket.id);
    if (state.status !== "lobby" && state.status !== "gameover") {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      const keptPlayers = state.players.map((p, i) => ({
        ...p,
        slot: i,
        color: COLORS[i],
        score: 0,
      }));
      const keptReferee = state.referee;
      state = createInitialState();
      state.players = keptPlayers;
      state.referee = keptReferee;
    } else {
      state.players = state.players.map((p, i) => ({
        ...p,
        slot: i,
        color: COLORS[i],
      }));
    }
    broadcast();
  });
});

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const iface of list) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  const ip = getLocalIp();
  console.log("");
  console.log("  Verb Rush — server started");
  console.log("");
  console.log(`    Local    →  http://localhost:${PORT}`);
  console.log(`    Network  →  http://${ip}:${PORT}`);
  console.log("");
  console.log("  Share the Network URL with your classmates.");
  console.log("");
});
