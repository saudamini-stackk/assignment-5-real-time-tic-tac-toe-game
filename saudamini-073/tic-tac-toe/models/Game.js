const mongoose = require("mongoose");

const gameSchema = new mongoose.Schema({
    playerX: {
        type: String,
        required: true
    },

    playerO: {
        type: String,
        required: true
    },

    winner: {
        type: String,
        default: null
    },

    result: {
        type: String,
        enum: ["win", "draw"],
        required: true
    },

    moves: {
        type: Number,
        required: true
    },

    playedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Game", gameSchema);