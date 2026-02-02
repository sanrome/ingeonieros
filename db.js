const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./geoguessr.db');

db.serialize(() => {
    // Tabla de usuarios
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT
    )`);

    // Tabla de rondas (el juego actual)
    db.run(`CREATE TABLE IF NOT EXISTS round (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_url TEXT,
        real_lat REAL,
        real_lon REAL,
        active INTEGER DEFAULT 1
    )`);

    // Tabla de suposiciones (guesses)
    db.run(`CREATE TABLE IF NOT EXISTS guesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        lat REAL,
        lon REAL,
        distance REAL,
        score INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Insertar una ronda inicial por defecto si no existe
    db.get("SELECT count(*) as count FROM round", (err, row) => {
        if (row.count === 0) {
            db.run(`INSERT INTO round (media_url, real_lat, real_lon) VALUES (
                'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Paris_Night.jpg/1024px-Paris_Night.jpg',
                48.8566,
                2.3522
            )`);
            console.log("Ronda inicial creada (Paris).");
        }
    });
});

module.exports = db;
