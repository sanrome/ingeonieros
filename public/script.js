// LOGIN LOGIC
const loginForm = document.getElementById('loginForm');
if (loginForm) {
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
            window.location.href = 'game.html';
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
        window.location.href = 'index.html';
    });
}

// GAME LOGIC
let map, marker, selectedLat, selectedLon;
let roundData = null;

async function initGame() {
    // Check Auth & Get User
    const meRes = await fetch('/api/me');
    if (!meRes.ok) {
        window.location.href = 'index.html';
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

    // Load Round
    loadRound();
}

function onMapClick(e) {
    if (document.getElementById('confirm-btn').disabled === true && document.getElementById('confirm-btn').innerText === "Confirmado") return;

    if (marker) {
        marker.setLatLng(e.latlng);
    } else {
        marker = L.marker(e.latlng).addTo(map);
    }
    selectedLat = e.latlng.lat;
    selectedLon = e.latlng.lng;
    document.getElementById('confirm-btn').disabled = false;
}

async function loadRound() {
    const res = await fetch('/api/round');
    if (!res.ok) return;
    
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
}

// Submit Guess
const confirmBtn = document.getElementById('confirm-btn');
if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
        if (!selectedLat) return;
        
        confirmBtn.disabled = true;
        confirmBtn.innerText = "Calculando...";
        
        const res = await fetch('/api/guess', {
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
    const lbRes = await fetch('/api/leaderboard');
    const leaderboard = await lbRes.json();
    
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';
    leaderboard.forEach(entry => {
        const li = document.createElement('li');
        li.innerText = `${entry.username}: ${entry.score} pts (${entry.distance.toFixed(1)} km)`;
        list.appendChild(li);
    });
    
    document.getElementById('result-modal').classList.remove('hidden');
}

document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('result-modal').classList.add('hidden');
});
