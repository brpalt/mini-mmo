const express = require('express');
const { v4: uuidv4 } = require('uuid');
const app = express();
app.use(express.json());

// This acts as your "Database" for now. 
// In a production app, you'd swap this for MongoDB or SQLite.
let giveaways = {};

// 1. Create a Giveaway
app.post('/api/giveaway/start', (req, res) => {
    const { duration, winnersCount, serverId, prize } = req.body;
    const giveawayId = uuidv4();
    const endTime = Date.now() + (duration * 60 * 60 * 1000); // Duration in hours

    giveaways[giveawayId] = {
        id: giveawayId,
        serverId: serverId,
        prize: prize,
        endTime: endTime,
        winnersCount: winnersCount,
        entrants: [], // Stores usernames
        status: 'active'
    };

    res.json({ success: true, giveawayId, endTime });
});

// 2. Enter a Giveaway
app.post('/api/giveaway/enter', (req, res) => {
    const { giveawayId, username } = req.body;
    if (giveaways[giveawayId]) {
        if (!giveaways[giveawayId].entrants.includes(username)) {
            giveaways[giveawayId].entrants.push(username);
            return res.json({ success: true, message: "Entered!" });
        }
        return res.status(400).json({ error: "Already entered" });
    }
    res.status(404).json({ error: "Giveaway not found" });
});

// 3. Get Info (For your Bot to check status)
app.get('/api/giveaway/:id', (req, res) => {
    const data = giveaways[req.params.id];
    data ? res.json(data) : res.status(404).send("Not found");
});

app.listen(3000, () => console.log('API running on port 3000'));
