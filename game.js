const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- CONFIG ---
const WORLD = { w: 3000, h: 2000 };
let peer, myId, connections = [];
let players = {}, items = {}, particles = [];
let isHost = false;
let camera = { x: 0, y: 0 };

const localPlayer = {
    id: null, username: "STIK", x: WORLD.w/2, y: WORLD.h/2,
    vx: 0, vy: 0, color: '#00f2ff', hp: 100, 
    facing: 1, anim: 0, lastA: 0, kills: 0,
    isAttacking: false, attackAngle: 0
};

const keys = {};
window.onkeydown = (e) => keys[e.key.toLowerCase()] = true;
window.onkeyup = (e) => keys[e.key.toLowerCase()] = false;

// --- INITIALIZATION ---
function startApp() {
    localPlayer.username = document.getElementById('username').value || "UNIT_" + Math.floor(Math.random()*999);
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('game-ui').style.display = 'block';
    
    peer = new Peer();
    peer.on('open', id => {
        myId = id; localPlayer.id = id;
        document.getElementById('my-id').innerText = id;
        players[myId] = localPlayer;
        requestAnimationFrame(gameLoop);
    });
    peer.on('connection', conn => { isHost = true; setupConn(conn); });
}

function joinGame() {
    const tid = document.getElementById('joinId').value;
    if(tid) setupConn(peer.connect(tid));
}

function setupConn(conn) {
    conn.on('open', () => {
        connections.push(conn);
        conn.send({ type: 'handshake', p: localPlayer });
    });
    conn.on('data', data => {
        if(data.type === 'sync') players[data.p.id] = data.p;
        if(data.type === 'handshake') players[data.p.id] = data.p;
        if(data.type === 'hit') handleDamage(data.val, data.from);
        if(data.type === 'spawn_item') items[data.item.id] = data.item;
        if(data.type === 'grab_item') delete items[data.itemId];
    });
}

// --- CORE SYSTEMS ---
function spawnParticle(x, y, color, count=5) {
    for(let i=0; i<count; i++) {
        particles.push({
            x, y, vx: (Math.random()-0.5)*10, vy: (Math.random()-0.5)*10,
            life: 1.0, color
        });
    }
}

function handleDamage(val, fromId) {
    localPlayer.hp -= val;
    spawnParticle(localPlayer.x, localPlayer.y, '#ff0044', 10);
    if(localPlayer.hp <= 0) {
        localPlayer.hp = 100;
        localPlayer.x = Math.random() * WORLD.w;
        localPlayer.y = Math.random() * WORLD.h;
        // Notify attacker of kill logic here if needed
    }
}

function drawStickman(p) {
    const relX = p.x - camera.x;
    const relY = p.y - camera.y;
    
    ctx.save();
    ctx.translate(relX, relY);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    // Animation variables
    const walk = Math.sin(p.anim) * 15;
    
    // Attack Visual
    if(p.isAttacking) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.arc(0, -20, 40, -0.5, 0.5);
        ctx.stroke();
    }

    // Body
    ctx.beginPath();
    ctx.arc(0, -45, 12, 0, Math.PI*2); // Head
    ctx.moveTo(0, -33); ctx.lineTo(0, 0); // Torso
    ctx.moveTo(0, -25); ctx.lineTo(p.facing * 20, -15 + (p.isAttacking ? -20 : 0)); // Arm
    ctx.moveTo(0, 0); ctx.lineTo(walk, 25); // Leg 1
    ctx.moveTo(0, 0); ctx.lineTo(-walk, 25); // Leg 2
    ctx.stroke();

    // UI Above Head
    ctx.fillStyle = "white";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(p.username, 0, -65);
    
    ctx.restore();
}

// --- MAIN LOOP ---
function gameLoop() {
    // 1. Physics & Input
    let moving = false;
    const speed = 5;
    if(keys['w']) { localPlayer.y -= speed; moving = true; }
    if(keys['s']) { localPlayer.y += speed; moving = true; }
    if(keys['a']) { localPlayer.x -= speed; localPlayer.facing = -1; moving = true; }
    if(keys['d']) { localPlayer.x += speed; localPlayer.facing = 1; moving = true; }
    
    if(moving) localPlayer.anim += 0.2;
    
    // Attack logic
    if(keys[' '] && Date.now() - localPlayer.lastA > 300) {
        localPlayer.isAttacking = true;
        localPlayer.lastA = Date.now();
        connections.forEach(c => {
            c.send({ type: 'sync', p: localPlayer });
            // Hit check
            Object.values(players).forEach(other => {
                if(other.id === myId) return;
                const d = Math.hypot(localPlayer.x - other.x, localPlayer.y - other.y);
                if(d < 60) c.send({ type: 'hit', val: 20, from: myId });
            });
        });
        setTimeout(() => localPlayer.isAttacking = false, 150);
    }

    // 2. Camera follow
    camera.x += (localPlayer.x - canvas.width/2 - camera.x) * 0.1;
    camera.y += (localPlayer.y - canvas.height/2 - camera.y) * 0.1;

    // 3. Rendering
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw Grid
    ctx.strokeStyle = "#111";
    for(let x = -camera.x % 100; x < canvas.width; x += 100) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for(let y = -camera.y % 100; y < canvas.height; y += 100) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Draw Particles
    particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy; p.life -= 0.02;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fillRect(p.x - camera.x, p.y - camera.y, 4, 4);
        if(p.life <= 0) particles.splice(i, 1);
    });
    ctx.globalAlpha = 1;

    // Draw Players
    Object.values(players).forEach(drawStickman);

    // 4. Network Sync
    if(Date.now() % 50 < 20) { // Sync roughly every 50ms
        connections.forEach(c => c.send({ type: 'sync', p: localPlayer }));
    }

    document.getElementById('hp-fill').style.width = localPlayer.hp + "%";
    requestAnimationFrame(gameLoop);
}
