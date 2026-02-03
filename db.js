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
        slug TEXT UNIQUE,
        media_url TEXT,
        real_lat REAL,
        real_lon REAL,
        active INTEGER DEFAULT 1
    )`);

    // Intentar añadir slug si no existe
    db.run("ALTER TABLE round ADD COLUMN slug TEXT UNIQUE", (err) => {
        // Ignorar si ya existe. Si falla por constraint unique en datos existentes, idealmente manejarlo, 
        // pero para este prototipo asumimos base limpia o sin colisiones manuales.
    });

    // Tabla de suposiciones (guesses)
    db.run(`CREATE TABLE IF NOT EXISTS guesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        round_id INTEGER,
        lat REAL,
        lon REAL,
        distance REAL,
        score INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(round_id) REFERENCES round(id)
    )`);

    // Intentar añadir round_id si no existe (para bases de datos ya creadas)
    db.run("ALTER TABLE guesses ADD COLUMN round_id INTEGER", (err) => {
        // Ignorar error si la columna ya existe
    });

    // Insertar una ronda inicial por defecto si no existe
    db.get("SELECT count(*) as count FROM round", (err, row) => {
        if (row.count === 0) {
            db.run(`INSERT INTO round (slug, media_url, real_lat, real_lon) VALUES (
                'paris',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Paris_Night.jpg/1024px-Paris_Night.jpg',
                48.8566,
                2.3522
            )`);
            console.log("Ronda inicial creada (Paris).");
        }
    });
});

module.exports = db;
