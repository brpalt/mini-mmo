const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let peer, myId, connections = [];
let players = {};
let items = []; // {x, y, type, id}
let frame = 0;

const localPlayer = {
    username: "Guest",
    x: 100, y: 100,
    color: "#" + Math.floor(Math.random()*16777215).toString(16),
    hp: 100,
    animStep: 0,
    isAttacking: false,
    inventory: [],
    facing: 1 // 1 for right, -1 for left
};

const keys = {};
window.onkeydown = (e) => keys[e.key] = true;
window.onkeyup = (e) => keys[e.key] = false;

function startApp() {
    const user = document.getElementById('username').value;
    if(user) localPlayer.username = user;
    document.getElementById('setup').style.display = 'none';
    document.getElementById('multiplayer').style.display = 'block';
    initNetwork();
}

function initNetwork() {
    peer = new Peer();
    peer.on('open', id => {
        myId = id;
        document.getElementById('my-id').innerText = id;
        players[myId] = localPlayer;
        updateLoop();
    });
    peer.on('connection', conn => setupConnection(conn));
}

function joinGame() {
    const targetId = document.getElementById('joinId').value;
    setupConnection(peer.connect(targetId));
}

function setupConnection(conn) {
    conn.on('open', () => {
        connections.push(conn);
        conn.send({ type: 'init', id: myId, data: localPlayer });
    });
    conn.on('data', data => {
        if(data.type === 'update') players[data.id] = data.data;
        if(data.type === 'init') players[data.id] = data.data;
        if(data.type === 'attack') handleCombat(data.id);
        if(data.type === 'spawnItem') items.push(data.item);
    });
}

// --- Animation & Drawing ---
function drawStickman(p) {
    const {x, y, color, animStep, facing, isAttacking} = p;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    
    // Walk animation math
    const legMove = Math.sin(animStep) * 15;
    const armMove = isAttacking ? 20 : Math.cos(animStep) * 10;

    // Head
    ctx.beginPath(); ctx.arc(x, y - 40, 10, 0, 7); ctx.stroke();
    // Body
    ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x, y); ctx.stroke();
    // Arms
    ctx.beginPath(); ctx.moveTo(x, y - 25); 
    ctx.lineTo(x + (facing * armMove), y - 10); ctx.stroke();
    // Legs
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - legMove, y + 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + legMove, y + 20); ctx.stroke();

    // Username & Health
    ctx.fillStyle = "black";
    ctx.font = "12px Arial";
    ctx.fillText(p.username, x - 20, y - 60);
    ctx.fillStyle = "red";
    ctx.fillRect(x - 15, y - 55, 30 * (p.hp/100), 4);
}

function handleCombat(attackerId) {
    const attacker = players[attackerId];
    if (!attacker) return;
    
    // Check if local player is hit
    const dist = Math.hypot(localPlayer.x - attacker.x, localPlayer.y - attacker.y);
    if (dist < 40 && attackerId !== myId) {
        localPlayer.hp -= 10;
        if(localPlayer.hp <= 0) {
            localPlayer.x = Math.random() * canvas.width;
            localPlayer.hp = 100;
        }
    }
}

function updateLoop() {
    frame++;
    let moved = false;

    // Movement Logic
    if (keys['w']) { localPlayer.y -= 3; moved = true; }
    if (keys['s']) { localPlayer.y += 3; moved = true; }
    if (keys['a']) { localPlayer.x -= 3; localPlayer.facing = -1; moved = true; }
    if (keys['d']) { localPlayer.x += 3; localPlayer.facing = 1; moved = true; }
    
    if (moved) localPlayer.animStep += 0.2;
    
    // Attack logic (Spacebar)
    if (keys[' '] && !localPlayer.isAttacking) {
        localPlayer.isAttacking = true;
        connections.forEach(c => c.send({type: 'attack', id: myId}));
        setTimeout(() => localPlayer.isAttacking = false, 200);
    }

    // Sync to others
    connections.forEach(c => c.send({type: 'update', id: myId, data: localPlayer}));

    // Draw everything
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Items
    items.forEach((item, index) => {
        ctx.fillStyle = "gold";
        ctx.beginPath(); ctx.arc(item.x, item.y, 8, 0, 7); ctx.fill();
        // Collection logic
        if(Math.hypot(localPlayer.x - item.x, localPlayer.y - item.y) < 20) {
            localPlayer.inventory.push("PowerUp");
            document.getElementById('item-list').innerText = localPlayer.inventory.join(", ");
            items.splice(index, 1);
        }
    });

    Object.values(players).forEach(p => drawStickman(p));
    
    // Item spawning logic (only if you are the host/first player)
    if (connections.length > 0 && frame % 300 === 0) {
        const newItem = { x: Math.random()*canvas.width, y: Math.random()*canvas.height, id: frame };
        items.push(newItem);
        connections.forEach(c => c.send({type: 'spawnItem', item: newItem}));
    }

    requestAnimationFrame(updateLoop);
}
