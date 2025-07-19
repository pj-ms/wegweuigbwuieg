import { useEffect, useState } from 'react';
import { SERVER_URL } from '@/constants/server-url';

// You can extend this file with helper functions if needed. Currently we don't
// use any helpers like pluralization, but you could add helpers here later.

// Colors for different tile types. Feel free to extend this mapping with more
// interesting materials as you expand the game. These CSS classes come from
// Tailwind: grass is green, dirt brown, stone gray, ore yellow etc.
const TILE_COLORS: Record<string, string> = {
    grass: 'bg-green-500',
    dirt: 'bg-yellow-700',
    stone: 'bg-gray-500',
    ore: 'bg-yellow-400',
    empty: 'bg-black',
};

// The size of our viewport. This defines how many tiles we render in each
// direction. Feel free to bump this up if you have more screen real estate.
const VIEW_SIZE = 15;

export default function App() {
    const [name, setName] = useState('');
    const [codeInput, setCodeInput] = useState('');
    const [session, setSession] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    // We never need a separate refreshFlag state – our polling handles updates for us.
    const [chatMessage, setChatMessage] = useState('');
    const [showHelp, setShowHelp] = useState(false);

    // Poll the server for updates. We use a small refresh flag so that once the
    // component mounts we wait until the server has some state before polling.
    useEffect(() => {
        let interval: any;
        if (session) {
            interval = setInterval(async () => {
                const resp = await fetch(`${SERVER_URL}/api/session/state?code=${session.code}`);
                if (resp.ok) {
                    const { state } = await resp.json();
                    setSession((s: any) => ({ ...s, state }));
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [session]);

    // Handler for creating a new game. Sends your name to the backend and
    // transitions into the game view once a session is created.
    async function handleCreate() {
        if (!name.trim()) {
            setError('Please enter your name');
            return;
        }
        const resp = await fetch(`${SERVER_URL}/api/session/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!resp.ok) {
            const errorBody = await resp.json();
            setError(errorBody.error || 'Unknown error');
            return;
        }
        const data: any = await resp.json();
        setSession({ name, code: data.code, state: data.state });
        setError(null);
    }

    // Handler for joining an existing game. Sends your name and the code you
    // entered to the backend and transitions into the game view.
    async function handleJoin() {
        if (!name.trim()) {
            setError('Please enter your name');
            return;
        }
        if (!codeInput.trim()) {
            setError('Please enter a game code');
            return;
        }
        const resp = await fetch(`${SERVER_URL}/api/session/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, code: codeInput.toUpperCase().trim() }),
        });
        if (!resp.ok) {
            const errorBody = await resp.json();
            setError(errorBody.error || 'Unknown error');
            return;
        }
        const data: any = await resp.json();
        setSession({ name, code: codeInput.toUpperCase().trim(), state: data.state });
        setError(null);
    }

    // Handler for mining. Whenever the user clicks on a tile we send a mine
    // action to the backend. The server will validate and update state.
    async function handleMine(x: number, y: number) {
        if (!session) return;
        const resp = await fetch(`${SERVER_URL}/api/session/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: session.code, action: { type: 'mine', x, y, name: session.name } }),
        });
        if (!resp.ok) {
            const errorBody = await resp.json();
            setError(errorBody.error || 'Unknown error');
            return;
        }
        const { state } = await resp.json();
        setSession((s: any) => ({ ...s, state }));
    }

    // Handler for moving the player. We'll allow arrow keys and buttons.
    async function handleMove(direction: string) {
        if (!session) return;
        const resp = await fetch(`${SERVER_URL}/api/session/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: session.code, action: { type: 'move', direction, name: session.name } }),
        });
        if (!resp.ok) {
            const errorBody = await resp.json();
            setError(errorBody.error || 'Unknown error');
            return;
        }
        const { state } = await resp.json();
        setSession((s: any) => ({ ...s, state }));
    }

    // Handler for sending chat messages. Appends the new message to the
    // session state on the server.
    async function handleChatSend() {
        if (!session || !chatMessage.trim()) return;
        const resp = await fetch(`${SERVER_URL}/api/session/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: session.code, action: { type: 'chat', message: chatMessage.trim(), name: session.name } }),
        });
        if (!resp.ok) {
            const errorBody = await resp.json();
            setError(errorBody.error || 'Unknown error');
            return;
        }
        const { state } = await resp.json();
        setSession((s: any) => ({ ...s, state }));
        setChatMessage('');
    }

    // Handler for exiting the game. Clears all state and returns user to
    // the lobby screen.
    function handleExit() {
        setSession(null);
        setName('');
        setCodeInput('');
        setError(null);
    }

    // Helper to compute the visible portion of the map. We center the grid
    // around the first player for now. Feel free to extend this if you support
    // multiple players in your view.
    function getVisibleMap(): any[][] {
        const grid: any[][] = [];
        if (!session) return grid;
        const { x, y } = session.state.players.find((p: any) => p.name === session.name);
        const half = Math.floor(VIEW_SIZE / 2);
        for (let j = y - half; j <= y + half; j++) {
            const row: any[] = [];
            for (let i = x - half; i <= x + half; i++) {
                const key = `${i},${j}`;
                const value = session.state.map[key] || 'empty';
                row.push({ x: i, y: j, type: value });
            }
            grid.push(row);
        }
        return grid;
    }

    // Simple keydown handler for arrow keys. Listens on the whole document.
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (!session) return;
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                handleMove('up');
                e.preventDefault();
            } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
                handleMove('down');
                e.preventDefault();
            } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                handleMove('left');
                e.preventDefault();
            } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                handleMove('right');
                e.preventDefault();
            }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [session]);

    return (
        <div className="h-screen flex flex-col bg-gray-800 text-white">
            <header className="bg-gray-900 p-4 flex items-center justify-between">
                <div className="font-bold text-2xl">Deep Diggers</div>
                {session && (
                    <div className="space-x-4">
                        <span>Code: <span className="font-mono font-semibold text-yellow-300">{session.code}</span></span>
                        <span>You: {session.name}</span>
                        <button onClick={() => setShowHelp(true)} className="underline ml-4">Help</button>
                        <button onClick={handleExit} className="ml-4 text-red-400">Exit</button>
                    </div>
                )}
            </header>
            {!session && (
                <main className="flex-grow flex items-center justify-center">
                    <div className="bg-gray-900 p-8 rounded-lg shadow-lg max-w-md w-full">
                        <h1 className="text-3xl mb-4">Welcome to Deep Diggers</h1>
                        <div className="mb-4">
                            <input
                                type="text"
                                placeholder="Your name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full p-3 rounded bg-gray-700 border border-gray-600 mb-2 text-white"
                            />
                        </div>
                        {error && <div className="text-red-500 mb-2">{error}</div>}
                        <div className="flex flex-col space-y-3">
                            <button onClick={handleCreate} className="w-full px-4 py-3 bg-green-600 text-white rounded hover:bg-green-500">Create New Game</button>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    placeholder="Game Code"
                                    value={codeInput}
                                    onChange={(e) => setCodeInput(e.target.value)}
                                    className="flex-1 p-3 rounded bg-gray-700 border border-gray-600 text-white"
                                />
                                <button onClick={handleJoin} className="bg-blue-600 p-3 rounded hover:bg-blue-500">Join Game</button>
                            </div>
                        </div>
                        <div className="mt-4 text-gray-400 text-sm">
                            Enter your name and create a new game or join an existing one using the code provided.
                        </div>
                    </div>
                </main>
            )}
            {session && (
                <div className="flex flex-1 overflow-hidden">
                    {/* Left sidebar: Inventory & Chat */}
                    <aside className="w-64 bg-gray-900 p-4 flex flex-col space-y-4 overflow-y-auto">
                        <section>
                            <h2 className="text-xl font-semibold mb-2">Inventory</h2>
                            {session.state.players && session.state.players.find((p: any) => p.name === session.name) &&
                                Object.entries(session.state.players.find((p: any) => p.name === session.name).inventory || {}).map(([key, value]: any) => (
                                <div key={key} className="flex items-center justify-between py-1 px-2 bg-gray-700 rounded mb-1">
                                    <span>{key}</span><span>x{value}</span>
                                </div>
                            ))}
                            {Object.keys(session.state.players.find((p: any) => p.name === session.name)?.inventory || {}).length === 0 && (
                                <div className="text-gray-400">Empty</div>
                            )}
                        </section>
                        <section className="flex-grow">
                            <h2 className="text-xl font-semibold mb-2">Players</h2>
                            <ul className="list-disc list-inside mb-4">
                                {session.state.players.map((p: any) => (
                                    <li key={p.name} className={p.name === session.name ? 'text-yellow-300' : ''}>{p.name}</li>
                                ))}
                            </ul>
                            <h2 className="text-xl font-semibold mb-2">Chat</h2>
                            <div className="flex flex-col flex-grow bg-gray-800 p-2 rounded mb-2 overflow-y-auto" style={{ minHeight: '200px' }}>
                                {session.state.chat && session.state.chat.length > 0 ? (
                                    session.state.chat.map((msg: any, idx: number) => (
                                        <div key={idx} className="mb-1">
                                            <span className="font-semibold text-yellow-300">{msg.name}</span>: {msg.message}
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-gray-400">No messages</div>
                                )}
                            </div>
                            <div className="flex space-x-2">
                                <input
                                    className="flex-1 p-2 rounded bg-gray-700 border border-gray-600 text-white"
                                    type="text"
                                    placeholder="Type a message..."
                                    value={chatMessage}
                                    onChange={(e) => setChatMessage(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleChatSend();
                                        }
                                    }}
                                />
                                <button onClick={handleChatSend} className="px-3 py-2 bg-blue-600 rounded hover:bg-blue-500">Send</button>
                            </div>
                        </section>
                    </aside>
                    {/* Main field: the grid and controls */}
                    <main className="flex-1 p-4 overflow-auto space-y-4">
                        <section>
                            <div className="grid grid-cols-0 auto-cols-fr place-items-center">
                                {/* The grid itself */}
                                <div className="grid grid-cols-15 grid-rows-15 gap-0 border-4 border-gray-700 shadow-lg">
                                    {getVisibleMap().map((row, rowIndex) => (
                                        row.map((cell: any, colIndex: number) => {
                                            const player = session.state.players.find((p: any) => p.name === session.name);
                                            const isPlayer = cell.x === player.x && cell.y === player.y;
                                            return (
                                                <div
                                                    key={`${rowIndex}-${colIndex}`}
                                                    className={`h-8 w-8 ${TILE_COLORS[cell.type] || TILE_COLORS.empty} border border-gray-700 cursor-pointer relative`}
                                                    onClick={() => handleMine(cell.x, cell.y)}
                                                >
                                                    {isPlayer && (
                                                        <div className="absolute inset-0 flex items-center justify-center text-black font-bold">👷</div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    ))}
                                </div>
                            </div>
                        </section>
                        {/* Controls */}
                        <section className="flex justify-center space-x-4">
                            <button onClick={() => handleMove('up')} className="px-3 py-2 bg-gray-700 rounded transform rotate-0 hover:bg-gray-600">↑</button>
                            <button onClick={() => handleMove('left')} className="px-3 py-2 bg-gray-700 rounded hover:bg-gray-600">←</button>
                            <button onClick={() => handleMove('down')} className="px-3 py-2 bg-gray-700 rounded hover:bg-gray-600">↓</button>
                            <button onClick={() => handleMove('right')} className="px-3 py-2 bg-gray-700 rounded hover:bg-gray-600">→</button>
                        </section>
                        <section className="flex space-x-4">
                            <button className="flex-1 p-3 bg-gray-700 rounded hover:bg-gray-600">Craft</button>
                            <button className="flex-1 p-3 bg-gray-700 rounded hover:bg-gray-600">Build</button>
                            <button className="flex-1 p-3 bg-gray-700 rounded hover:bg-gray-600">Status</button>
                        </section>
                    </main>
                </div>
            )}
            {/* Help modal overlay */}
            {showHelp && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center">
                    <div className="bg-gray-900 p-8 rounded-lg max-w-lg text-white">
                        <h2 className="text-3xl mb-4">Help & Rules</h2>
                        <p className="mb-2">
                            Welcome to Deep Diggers! Here are the basics to get you exploring:
                        </p>
                        <ul className="list-disc list-inside mb-4">
                            <li>Move around the underground world by clicking the arrows or using your keyboard.</li>
                            <li>Click on tiles to dig them. Soft dirt and stone drop resources into your inventory.</li>
                            <li>As you gather materials you'll be able to craft better tools (not yet implemented) and build structures (coming soon!).</li>
                            <li>Work together with friends in the same session. Share resources via chests (coming soon!).</li>
                            <li>Chat with other players in the chat box!</li>
                        </ul>
                        <button onClick={() => setShowHelp(false)} className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500">Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
