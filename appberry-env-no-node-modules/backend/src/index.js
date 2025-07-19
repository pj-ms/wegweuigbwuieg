import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { dummyTable } from './db/schema';
import { sessionsTable } from './db/schema';
const app = new Hono();
app.use('*', cors({
    origin: (_origin, c) => c.env.CORS_ORIGIN,
    credentials: true,
}));
// Existing routes are provided for demonstration purposes only.
// API routes must ALWAYS be prefixed with /api, to differentiate them from routes that should serve the frontend's static assets.
const routes = app
    .get('/api', async (c) => {
    return c.text('Hello World!');
})
    // $ curl -X POST "http://localhost:8787/api/echo" -H "Content-Type: application/json" -d '{"field1": "value1", "field2": 5}'
    // {"field1":"value1","field2":5}
    .post('/api/echo', zValidator('json', z.object({
    field1: z.string(),
    field2: z.number(),
})), async (c) => {
    const { field1, field2 } = c.req.valid('json');
    return c.json({ field1, field2 });
})
    .get('/api/d1-demo', async (c) => {
    const db = drizzle(c.env.DB);
    await db.delete(dummyTable).where(eq(dummyTable.id, 'test_id'));
    // Should not typically write data in a GET route. This is for demonstration purposes only.
    await db.insert(dummyTable).values({ id: 'test_id', description: 'test description' });
    const result = await db.select().from(dummyTable);
    return c.json(result);
});
// -----------------------------------------------------------------------------
// SESSION ROUTES
//
// These endpoints power the Deep Diggers lobby and core gameplay. You can create
// and join sessions, poll for game state, and issue actions such as mining
// tiles. Feel free to extend these routes if you'd like to add more
// functionality such as crafting, chat or creature handling. All data lives
// in the D1 database via our Drizzle schema. For the sake of simplicity this
// implementation stores the entire game state as one JSON blob. For a more
// complex game you could normalize your state across multiple tables.
// A simple helper to generate random lobby codes. Feel free to bump the
// code length or change the alphabet as you see fit.
function generateCode(length = 4) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
// A helper to initialize a new map. This implementation generates a small
// region around the spawn point (0,0). Feel free to extend this into a true
// procedural generator using your favorite noise algorithm or a seeded RNG.
function generateMap(width = 32, height = 32) {
    const map = {};
    const halfW = Math.floor(width / 2);
    for (let x = -halfW; x < halfW; x++) {
        for (let y = 0; y < height; y++) {
            let type = 'dirt';
            if (y === 0)
                type = 'grass';
            else if (y < 5)
                type = 'dirt';
            else if (y < 10)
                type = 'stone';
            else if (y < 15)
                type = Math.random() < 0.1 ? 'ore' : 'stone';
            else
                type = Math.random() < 0.05 ? 'ore' : 'stone';
            map[`${x},${y}`] = type;
        }
    }
    return map;
}
// POST /api/session/create
app.post('/api/session/create', async (c) => {
    const body = await c.req.json();
    const name = body.name;
    if (!name) {
        return c.json({ error: 'Name is required' }, 400);
    }
    const db = drizzle(c.env.DB);
    // Generate a unique code. Try up to 5 times before giving up.
    let code = generateCode();
    let exists = await db.select().from(sessionsTable).where(eq(sessionsTable.code, code)).get();
    let attempts = 0;
    while (exists && attempts < 5) {
        code = generateCode();
        exists = await db.select().from(sessionsTable).where(eq(sessionsTable.code, code)).get();
        attempts++;
    }
    // Seed can be a simple UUID or random string. Used for procedural generation.
    const seed = crypto.randomUUID();
    // Initialize session state. The map is a simple 32x32 grid. Players is an array
    // containing the initial player. You're free to extend this structure later.
    const state = {
        map: generateMap(),
        players: [
            {
                name,
                x: 0,
                y: 0,
                inventory: {},
            },
        ],
        chat: [],
    };
    await db.insert(sessionsTable).values({ code, seed, state: JSON.stringify(state) });
    return c.json({ code, state });
});
// POST /api/session/join
app.post('/api/session/join', async (c) => {
    const body = await c.req.json();
    const name = body.name;
    const code = body.code;
    if (!name || !code) {
        return c.json({ error: 'Name and code are required' }, 400);
    }
    const db = drizzle(c.env.DB);
    const sessionEntry = await db.select().from(sessionsTable).where(eq(sessionsTable.code, code)).get();
    if (!sessionEntry) {
        return c.json({ error: 'Session not found' }, 404);
    }
    const state = JSON.parse(sessionEntry.state ?? '{}');
    // If player already exists, don't add again
    const exists = state.players.find((p) => p.name === name);
    if (!exists) {
        state.players.push({ name, x: 0, y: 0, inventory: {} });
        await db.update(sessionsTable).set({ state: JSON.stringify(state) }).where(eq(sessionsTable.code, code));
    }
    return c.json({ code, state });
});
// GET /api/session/state?code=...
app.get('/api/session/state', async (c) => {
    const code = c.req.query('code');
    if (!code) {
        return c.json({ error: 'Session code is required' }, 400);
    }
    const db = drizzle(c.env.DB);
    const sessionEntry = await db.select().from(sessionsTable).where(eq(sessionsTable.code, code)).get();
    if (!sessionEntry) {
        return c.json({ error: 'Session not found' }, 404);
    }
    const state = JSON.parse(sessionEntry.state ?? '{}');
    return c.json({ state });
});
// POST /api/session/action
app.post('/api/session/action', async (c) => {
    const body = await c.req.json();
    const code = body.code;
    const action = body.action;
    if (!code || !action) {
        return c.json({ error: 'Missing code or action' }, 400);
    }
    const db = drizzle(c.env.DB);
    const sessionEntry = await db.select().from(sessionsTable).where(eq(sessionsTable.code, code)).get();
    if (!sessionEntry) {
        return c.json({ error: 'Session not found' }, 404);
    }
    const state = JSON.parse(sessionEntry.state ?? '{}');
    // Only implement mine action for now.
    if (action.type === 'mine') {
        const { x, y, name } = action;
        // Check player exists
        const player = state.players.find((p) => p.name === name);
        if (!player) {
            return c.json({ error: 'Player not found' }, 404);
        }
        const key = `${x},${y}`;
        const tile = state.map[key];
        if (!tile || tile === 'empty') {
            // Nothing here
        }
        else {
            // Simplified mining: remove tile and add to inventory
            state.map[key] = 'empty';
            player.inventory[tile] = (player.inventory[tile] || 0) + 1;
        }
    }
    else if (action.type === 'move') {
        const { direction, name } = action;
        const player = state.players.find((p) => p.name === name);
        if (!player) {
            return c.json({ error: 'Player not found' }, 404);
        }
        // Simple move: move by one cell
        let dx = 0;
        let dy = 0;
        if (direction === 'up')
            dy = -1;
        if (direction === 'down')
            dy = 1;
        if (direction === 'left')
            dx = -1;
        if (direction === 'right')
            dx = 1;
        player.x += dx;
        player.y += dy;
    }
    else if (action.type === 'chat') {
        const { message, name } = action;
        state.chat.push({ name, message, timestamp: Date.now() });
    }
    await db.update(sessionsTable).set({ state: JSON.stringify(state) }).where(eq(sessionsTable.code, code));
    return c.json({ state });
});
export default app;
