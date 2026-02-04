const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'geo-secret-key-very-secure',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 días
}));

// Autenticación Middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
};

// Login / Registro Automático
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Faltan datos' });
    }

    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });

        if (user) {
            // Usuario existe, verificar contraseña
            const match = await bcrypt.compare(password, user.password_hash);
            if (match) {
                req.session.userId = user.id;
                req.session.username = user.username;
                return res.json({ message: 'Login exitoso', username: user.username });
            } else {
                return res.status(401).json({ error: 'Contraseña incorrecta' });
            }
        } else {
            // Usuario nuevo, crear cuenta
            const hash = await bcrypt.hash(password, 10);
            db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, hash], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                req.session.userId = this.lastID;
                req.session.username = username;
                return res.json({ message: 'Usuario creado y logueado', username: username });
            });
        }
    });
});

app.get('/api/me', (req, res) => {
    if (req.session.userId) {
        res.json({ username: req.session.username, id: req.session.userId });
    } else {
        res.status(401).json({ error: 'No logueado' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logout exitoso' });
});

// Obtener datos de la ronda por SLUG
app.get('/api/round/:slug', requireAuth, (req, res) => {
    const slug = req.params.slug;
    db.get("SELECT media_url, id, real_lat, real_lon FROM round WHERE slug = ?", [slug], (err, round) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!round) return res.status(404).json({ error: "Partida no encontrada" });
        
        // Verificar si el usuario ya jugó esta ronda
        db.get("SELECT * FROM guesses WHERE user_id = ? AND round_id = ? LIMIT 1", [req.session.userId, round.id], (err, guess) => {
             if (guess) {
                 return res.json({
                     media_url: round.media_url,
                     id: round.id,
                     guessed: true,
                     guess: guess,
                     real_lat: round.real_lat,
                     real_lon: round.real_lon
                 });
             }
             res.json({
                 media_url: round.media_url,
                 id: round.id,
                 guessed: false
             });
        });
    });
});

// Enviar suposición con SLUG
app.post('/api/guess/:slug', requireAuth, (req, res) => {
    const { lat, lon } = req.body;
    const slug = req.params.slug;
    const userId = req.session.userId;

    // Obtener la ronda por slug
    db.get("SELECT * FROM round WHERE slug = ?", [slug], (err, round) => {
        if (err || !round) return res.status(404).json({ error: 'Ronda no encontrada' });

        // Verificar si ya adivinó para esta ronda
        db.get("SELECT * FROM guesses WHERE user_id = ? AND round_id = ? LIMIT 1", [userId, round.id], (err, existingGuess) => {
            if (existingGuess) {
                return res.status(400).json({ error: 'Ya has jugado esta ronda.' });
            }

            // Lógica de distancia
            const R = 6371; 
            const dLat = (lat - round.real_lat) * Math.PI / 180;
            const dLon = (lon - round.real_lon) * Math.PI / 180;
            const a = 
                Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(round.real_lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * 
                Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c; 

            // Puntaje
            const score = Math.round(5000 * Math.exp(-distance / 2000));

            db.run("INSERT INTO guesses (user_id, round_id, lat, lon, distance, score) VALUES (?, ?, ?, ?, ?, ?)",
                [userId, round.id, lat, lon, distance, score],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ distance, score, real_lat: round.real_lat, real_lon: round.real_lon });
                }
            );
        });
    });
});

// Leaderboard por SLUG
app.get('/api/leaderboard/:slug', (req, res) => {
    const slug = req.params.slug;
    const sql = `
        SELECT u.username, g.score, g.distance, g.lat, g.lon 
        FROM guesses g
        JOIN users u ON g.user_id = u.id
        JOIN round r ON g.round_id = r.id
        WHERE r.slug = ?
        ORDER BY g.score DESC, g.distance ASC
        LIMIT 10
    `;
    db.all(sql, [slug], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// --- ADMIN ---
app.post('/admin/create-round', requireAuth, (req, res) => {
    // Muy simple: cualquiera logueado puede intentar acceder si conoce la ruta, 
    // pero idealmente verificaríamos un flag 'isAdmin'. 
    // Por simplicidad del prompt "login simple", lo dejamos abierto o chequeamos username 'admin'.
    
    if (req.session.username !== 'admin') {
        return res.status(403).json({ error: 'Solo admin' });
    }

    const { media_url, real_lat, real_lon, slug } = req.body;
    
    // Crear nueva ronda con slug específico
    // Generar slug si no viene (simple timestamp o random)
    const finalSlug = slug || 'game-' + Date.now();

    db.run("INSERT INTO round (slug, media_url, real_lat, real_lon) VALUES (?, ?, ?, ?)", 
        [finalSlug, media_url, real_lat, real_lon], 
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                     return res.status(400).json({ error: 'El nombre de la partida ya existe.' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'Ronda creada exitosamente', slug: finalSlug });
        }
    );
});

// Obtener todas las rondas (ADMIN)
app.get('/admin/rounds', requireAuth, (req, res) => {
    if (req.session.username !== 'admin') {
        return res.status(403).json({ error: 'Solo admin' });
    }

    db.all("SELECT * FROM round ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
