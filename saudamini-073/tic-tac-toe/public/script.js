const socket = io();

const loginSection = document.getElementById("login-section");
const gameSection = document.getElementById("game-section");
const playerNameInput = document.getElementById("player-name");
const loginButton = document.getElementById("login-btn");
const loginMessage = document.getElementById("login-message");
const playerXName = document.getElementById("player-x-name");
const playerOName = document.getElementById("player-o-name");
const gameStatus = document.getElementById("game-status");
const resetButton = document.getElementById("reset-btn");
const board = document.getElementById("board");
const cells = document.querySelectorAll(".cell");

let myPlayer = null;
let gameStarted = false;

loginButton.addEventListener("click", login);

playerNameInput.addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        login();
    }
});

function login() {
    const name = playerNameInput.value.trim();

    if (!name) {
        loginMessage.textContent = "Please enter your name.";
        return;
    }

    loginMessage.textContent = "";
    socket.emit("user-login", name);
}

board.addEventListener("click", function(event) {
    const cell = event.target.closest(".cell");

    if (!cell) {
        return;
    }

    event.preventDefault();

    if (!myPlayer) {
        console.log("No player logged in.");
        return;
    }

    if (!gameStarted) {
        console.log("Game is not active.");
        return;
    }

    const index = Number(cell.dataset.index);

    if (!Number.isInteger(index)) {
        console.log("Invalid cell index.");
        return;
    }

    if (index < 0 || index > 8) {
        console.log("Cell index outside board.");
        return;
    }

    if (cell.textContent.trim() !== "") {
        console.log("Cell already occupied.");
        return;
    }

    console.log(`Sending move: ${index} as ${myPlayer.symbol}`);
    socket.emit("make-move", index);
});

socket.on("login-success", function(data) {
    myPlayer = data.player;
    loginSection.classList.add("hidden");
    gameSection.classList.remove("hidden");
    loginMessage.textContent = "";
    gameStatus.textContent = `You are Player ${myPlayer.symbol}`;
});

socket.on("login-error", function(data) {
    loginMessage.textContent = data.message;
});

socket.on("players-update", function(data) {
    const players = data.players;

    playerXName.textContent = "Waiting...";
    playerOName.textContent = "Waiting...";

    players.forEach(function(player) {
        if (player.symbol === "X") {
            playerXName.textContent = player.name;
        }

        if (player.symbol === "O") {
            playerOName.textContent = player.name;
        }
    });
});

socket.on("waiting-for-player", function() {
    gameStarted = false;
    gameStatus.textContent = "Waiting for another player...";
});

socket.on("game-start", function(data) {
    gameStarted = true;
    updateBoard(data.board);
    updateTurn(data.currentPlayer);
});

socket.on("move-made", function(data) {
    gameStarted = true;
    updateBoard(data.board);
    updateTurn(data.currentPlayer);
});

socket.on("game-over", function(data) {
    gameStarted = false;
    updateBoard(data.board);

    if (data.result === "draw") {
        gameStatus.textContent = "🤝 It's a draw!";
        return;
    }

    if (data.result === "win") {
        if (myPlayer && data.winner === myPlayer.symbol) {
            gameStatus.textContent = "🎉 You won!";
        } else {
            gameStatus.textContent = "😔 You lost!";
        }
    }
});

socket.on("game-ended", function() {
    myPlayer = null;
    gameStarted = false;

    clearBoard();

    gameSection.classList.add("hidden");
    loginSection.classList.remove("hidden");

    playerNameInput.value = "";
    playerXName.textContent = "Waiting...";
    playerOName.textContent = "Waiting...";
    gameStatus.textContent = "Waiting for another player...";
    loginMessage.textContent = "Game ended. Please login again to play.";

    loadGameHistory();
});

socket.on("player-disconnected", function(data) {
    gameStarted = false;
    clearBoard();

    gameStatus.textContent =
        `${data.player.name} left the game. Waiting for another player...`;
});

function updateBoard(boardState) {
    cells.forEach(function(cell, index) {
        const value = boardState[index] || "";

        cell.textContent = value;

        cell.classList.remove("x", "o", "winner");

        if (value === "X") {
            cell.classList.add("x");
        }

        if (value === "O") {
            cell.classList.add("o");
        }
    });
}

function updateTurn(currentPlayer) {
    if (!myPlayer) {
        return;
    }

    if (currentPlayer === myPlayer.symbol) {
        gameStatus.textContent = `Your turn • ${myPlayer.symbol}`;
    } else {
        gameStatus.textContent = `Opponent's turn • ${currentPlayer}`;
    }
}

function clearBoard() {
    cells.forEach(function(cell) {
        cell.textContent = "";
        cell.classList.remove("x", "o", "winner");
    });
}

async function loadGameHistory() {
    try {
        const response = await fetch("/api/games");

        if (!response.ok) {
            throw new Error("Failed to fetch game history.");
        }

        const games = await response.json();
        const historyContainer = document.getElementById("game-history");

        if (!historyContainer) {
            return;
        }

        if (games.length === 0) {
            historyContainer.innerHTML = "<p>No games played yet.</p>";
            return;
        }

        historyContainer.innerHTML = "";

        games.forEach(function(game) {
            const historyItem = document.createElement("div");
            historyItem.classList.add("history-item");

            const date = new Date(game.playedAt);

            let resultText;

            if (game.result === "draw") {
                resultText = "🤝 Draw";
            } else {
                resultText = `🏆 Winner: ${game.winner}`;
            }

            historyItem.innerHTML = `
                <div class="history-players">
                    <strong>${escapeHTML(game.playerX)}</strong>
                    <span>vs</span>
                    <strong>${escapeHTML(game.playerO)}</strong>
                </div>
                <div class="history-result">
                    ${escapeHTML(resultText)}
                </div>
                <div class="history-moves">
                    Moves: ${game.moves}
                </div>
                <div class="history-date">
                    ${date.toLocaleString()}
                </div>
            `;

            historyContainer.appendChild(historyItem);
        });
    } catch (error) {
        console.error("Error loading game history:", error);
    }
}

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
}

loadGameHistory();