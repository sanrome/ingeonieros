// LOGIN LOGIC
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    // Check if already logged in
    fetch('/api/me').then(res => {
        // Preserve current query params (game slug) on redirect
        if (res.ok) window.location.href = 'game.html' + window.location.search;
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        if (res.ok) {
            window.location.href = 'game.html' + window.location.search;
        } else {
            document.getElementById('message').innerText = data.error;
        }
    });
}

// LOGOUT LOGIC
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = 'index.html' + window.location.search;
    });
}

// GAME LOGIC
let map, marker, selectedLat, selectedLon;
let roundData = null;
// Get game slug from URL or default to 'paris'
const urlParams = new URLSearchParams(window.location.search);
const gameSlug = urlParams.get('game') || 'paris';

async function initGame() {
    // Check Auth & Get User
    const meRes = await fetch('/api/me');
    if (!meRes.ok) {
        window.location.href = 'index.html' + window.location.search;
        return;
    }
    const user = await meRes.json();
    document.getElementById('user-display').innerText = `Hola, ${user.username}`;
    
    // Show Admin Link if username is admin
    if (user.username === 'admin') {
        document.getElementById('admin-link').style.display = 'inline-block';
    }

    // Init Map centered on Europe
    map = L.map('map').setView([54.5260, 15.2551], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Click handler
    map.on('click', onMapClick);

    // Load Round with specific slug
    loadRound(gameSlug);
}

function onMapClick(e) {
    // Si ya jugó (roundData.guessed es true) o el botón está procesando, no hacer nada.
    if (roundData && roundData.guessed) return;
    
    if (marker) {
        marker.setLatLng(e.latlng);
    } else {
        marker = L.marker(e.latlng).addTo(map);
    }
    selectedLat = e.latlng.lat;
    selectedLon = e.latlng.lng;
    
    // Habilitar botón solo si no ha jugado
    if (!roundData || !roundData.guessed) {
        document.getElementById('confirm-btn').disabled = false;
    }
}

async function loadRound(slug) {
    const res = await fetch(`/api/round/${slug}`);
    if (!res.ok) {
        alert("Partida no encontrada: " + slug);
        return;
    }
    
    roundData = await res.json();
    
    const mediaContainer = document.getElementById('media-content');
    mediaContainer.innerHTML = '';
    
    // Detect if image or video
    const url = roundData.media_url;
    if (url.match(/\.(mp4|webm|ogg)$/i)) {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.autoplay = true;
        video.loop = true;
        mediaContainer.appendChild(video);
    } else {
        const img = document.createElement('img');
        img.src = url;
        mediaContainer.appendChild(img);
    }

    // Si ya adivinó, bloquear y mostrar resultados
    if (roundData.guessed) {
        const btn = document.getElementById('confirm-btn');
        btn.innerText = "Ya jugaste";
        btn.disabled = true;
        
        // Mostrar markers
        const guess = roundData.guess;
        
        // Marker usuario
        L.marker([guess.lat, guess.lon]).addTo(map).bindPopup("Tu elección").openPopup();
        
        // Marker real
        L.marker([roundData.real_lat, roundData.real_lon], {
             icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            })
        }).addTo(map).bindPopup("Ubicación Real");
        
        // Línea
        L.polyline([
            [guess.lat, guess.lon],
            [roundData.real_lat, roundData.real_lon]
        ], {color: 'red'}).addTo(map);
        
        map.fitBounds([
            [guess.lat, guess.lon],
            [roundData.real_lat, roundData.real_lon]
        ], {padding: [50,50]});

        // Mostrar botón leaderboard
        document.getElementById('leaderboard-btn').style.display = 'inline-block';

        // Pre-cargar datos del modal
        document.getElementById('res-distance').innerText = guess.distance.toFixed(2);
        document.getElementById('res-score').innerText = guess.score;
        
        // Cargar ranking
        loadLeaderboard(slug);
    }
}

async function loadLeaderboard(slug) {
    const lbRes = await fetch(`/api/leaderboard/${slug}`);
    const leaderboard = await lbRes.json();
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
    leaderboard.forEach(entry => {
        const li = document.createElement('li');
        li.innerText = `${entry.username}: ${entry.score} pts (${entry.distance.toFixed(1)} km)`;
        list.appendChild(li);
    });
}

// Submit Guess
const confirmBtn = document.getElementById('confirm-btn');
if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
        if (!selectedLat) return;
        
        confirmBtn.disabled = true;
        confirmBtn.innerText = "Calculando...";
        
        const res = await fetch(`/api/guess/${gameSlug}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ lat: selectedLat, lon: selectedLon })
        });
        
        const result = await res.json();
        
        if (res.ok) {
            confirmBtn.innerText = "Confirmado";
            showResults(result);
            // Show real location
            L.marker([result.real_lat, result.real_lon], {
                icon: L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34],
                    shadowSize: [41, 41]
                })
            }).addTo(map).bindPopup("Ubicación Real").openPopup();
            
            // Draw line
            L.polyline([
                [selectedLat, selectedLon],
                [result.real_lat, result.real_lon]
            ], {color: 'red'}).addTo(map);
            
            // Fit bounds
            map.fitBounds([
                [selectedLat, selectedLon],
                [result.real_lat, result.real_lon]
            ], {padding: [50,50]});

        } else {
            alert("Error enviando respuesta");
            confirmBtn.disabled = false;
        }
    });
}

async function showResults(result) {
    document.getElementById('res-distance').innerText = result.distance.toFixed(2);
    document.getElementById('res-score').innerText = result.score;
    
    // Load leaderboard
    loadLeaderboard(gameSlug);
    
    document.getElementById('result-modal').classList.remove('hidden');
    
    // Mostrar botón de ver ranking
    const lbBtn = document.getElementById('leaderboard-btn');
    if (lbBtn) lbBtn.style.display = 'inline-block';
}

const lbBtn = document.getElementById('leaderboard-btn');
if (lbBtn) {
    lbBtn.addEventListener('click', () => {
        document.getElementById('result-modal').classList.remove('hidden');
    });
}

document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('result-modal').classList.add('hidden');
});
