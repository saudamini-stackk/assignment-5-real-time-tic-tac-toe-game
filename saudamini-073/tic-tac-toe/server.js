const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const Game = require("./models/Game");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let players = [];

let game = {
    board: ["", "", "", "", "", "", "", ""],
    currentPlayer: "X",
    gameActive: false,
    moveCount: 0
};

const winningCombinations = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
];

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log("MongoDB connected successfully.");
        server.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error("MongoDB connection failed:", error.message);
    });

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("user-login", (playerName) => {
        playerName = String(playerName).trim();

        if (!playerName) {
            socket.emit("login-error", {
                message: "Please enter a valid name."
            });
            return;
        }

        if (players.length >= 2) {
            socket.emit("login-error", {
                message: "Game is full. Please wait for a player to leave."
            });
            return;
        }

        const alreadyLoggedIn = players.some(
            player => player.name.toLowerCase() === playerName.toLowerCase()
        );

        if (alreadyLoggedIn) {
            socket.emit("login-error", {
                message: "This name is already being used."
            });
            return;
        }

        const symbol = players.length === 0 ? "X" : "O";

        const player = {
            id: socket.id,
            name: playerName,
            symbol: symbol
        };

        players.push(player);

        socket.emit("login-success", {
            player: player
        });

        io.emit("players-update", {
            players: players
        });

        console.log(`${player.name} joined as ${player.symbol}`);

        if (players.length === 1) {
            socket.emit("waiting-for-player");
        }

        if (players.length === 2) {
            startNewGame();
        }
    });

    socket.on("make-move", async (rawIndex) => {
        console.log("Move received:", rawIndex, "from:", socket.id);

        const player = players.find(
            player => player.id === socket.id
        );

        if (!player) {
            console.log("Move rejected: player not found.");
            return;
        }

        if (!game.gameActive) {
            console.log("Move rejected: game is not active.");
            return;
        }

        if (player.symbol !== game.currentPlayer) {
            console.log("Move rejected: wrong player's turn.");
            return;
        }

        const index = Number(rawIndex);

        if (!Number.isInteger(index) || index < 0 || index > 8) {
            console.log("Move rejected: invalid index:", rawIndex);
            return;
        }

        if (game.board[index] !== "") {
            console.log("Move rejected: cell already occupied:", index);
            return;
        }

        game.board[index] = player.symbol;
        game.moveCount++;

        console.log(`${player.name} placed ${player.symbol} in cell ${index}`);
        console.log("Current board:", game.board);

        const winner = checkWinner();

        if (winner) {
            game.gameActive = false;

            io.emit("game-over", {
                result: "win",
                winner: winner,
                board: game.board
            });

            await saveGame(winner);

            console.log(`${player.name} won the game.`);

            setTimeout(() => {
                endGame();
            }, 3000);

            return;
        }

        if (!game.board.includes("")) {
            game.gameActive = false;

            io.emit("game-over", {
                result: "draw",
                winner: null,
                board: game.board
            });

            await saveGame(null);

            console.log("Game ended in a draw.");

            setTimeout(() => {
                endGame();
            }, 3000);

            return;
        }

        game.currentPlayer =
            game.currentPlayer === "X" ? "O" : "X";

        io.emit("move-made", {
            board: [...game.board],
            currentPlayer: game.currentPlayer
        });

        console.log(`Turn changed to ${game.currentPlayer}`);
    });

    socket.on("reset-game", () => {
        if (players.length !== 2) {
            return;
        }

        startNewGame();
    });

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        const disconnectedPlayer = players.find(
            player => player.id === socket.id
        );

        if (!disconnectedPlayer) {
            return;
        }

        players = players.filter(
            player => player.id !== socket.id
        );

        game.board = ["", "", "", "", "", "", "", ""];
        game.currentPlayer = "X";
        game.gameActive = false;
        game.moveCount = 0;

        io.emit("player-disconnected", {
            player: disconnectedPlayer
        });

        io.emit("players-update", {
            players: players
        });

        console.log(`${disconnectedPlayer.name} left the game.`);
    });
});

function startNewGame() {
    game.board = ["", "", "", "", "", "", "", ""];
    game.currentPlayer = "X";
    game.gameActive = true;
    game.moveCount = 0;

    io.emit("game-start", {
        players: players,
        board: [...game.board],
        currentPlayer: game.currentPlayer
    });

    console.log("New game started.");
}

async function saveGame(winner) {
    try {
        const playerX = players.find(
            player => player.symbol === "X"
        );

        const playerO = players.find(
            player => player.symbol === "O"
        );

        if (!playerX || !playerO) {
            return;
        }

        const winnerName = winner
            ? winner === "X"
                ? playerX.name
                : playerO.name
            : null;

        const result = winner ? "win" : "draw";

        const completedGame = new Game({
            playerX: playerX.name,
            playerO: playerO.name,
            winner: winnerName,
            result: result,
            moves: game.moveCount
        });

        await completedGame.save();

        console.log("Game saved to MongoDB.");
    } catch (error) {
        console.error("Failed to save game:", error.message);
    }
}

function endGame() {
    game.board = ["", "", "", "", "", "", "", ""];
    game.currentPlayer = "X";
    game.gameActive = false;
    game.moveCount = 0;
    players = [];

    io.emit("game-ended");

    io.emit("players-update", {
        players: []
    });

    console.log("Game ended. Players must login again.");
}

function checkWinner() {
    for (const combination of winningCombinations) {
        const [a, b, c] = combination;

        if (
            game.board[a] !== "" &&
            game.board[a] === game.board[b] &&
            game.board[a] === game.board[c]
        ) {
            return game.board[a];
        }
    }

    return null;
}

app.get("/api/games", async (req, res) => {
    try {
        const games = await Game.find()
            .sort({
                playedAt: -1
            })
            .limit(20);

        res.json(games);
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch game history."
        });
    }
});

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});