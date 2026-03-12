/**
 * Simulate 30 agents in the world for N ticks and print a visual map.
 * Usage: npx tsx scripts/simulate_world.ts [ticks]
 */
import { tickWorld, cellCenter, pickRandomHeading, endConversation } from "../src/domain/world.ts";
import type { AgentPosition } from "../src/domain/types.ts";
import {
  WORLD_GRID_COLUMNS,
  WORLD_GRID_ROWS,
  BEHAVIOR_TICK_MIN,
  BEHAVIOR_TICK_MAX
} from "../src/domain/constants.ts";

const AGENT_COUNT = 30;
const TICKS = parseInt(process.argv[2] || "100", 10);
const CONVO_DURATION_TICKS = 10; // Simulate conversations lasting ~10 seconds

// Spawn agents in a roughly central cluster (simulating town center density)
function spawnAgents(count: number): AgentPosition[] {
  const occupied = new Set<string>();
  const agents: AgentPosition[] = [];
  const centerX = Math.floor(WORLD_GRID_COLUMNS / 2);
  const centerY = Math.floor(WORLD_GRID_ROWS / 2);
  const spawnRadius = 12;

  for (let i = 0; i < count; i++) {
    let cx: number, cy: number, key: string;
    let attempts = 0;
    do {
      cx = centerX + Math.floor(Math.random() * spawnRadius * 2) - spawnRadius;
      cy = centerY + Math.floor(Math.random() * spawnRadius * 2) - spawnRadius;
      cx = Math.max(0, Math.min(WORLD_GRID_COLUMNS - 1, cx));
      cy = Math.max(0, Math.min(WORLD_GRID_ROWS - 1, cy));
      key = `${cx}:${cy}`;
      attempts++;
    } while (occupied.has(key) && attempts < 100);
    occupied.add(key);

    const center = cellCenter(cx, cy);
    const heading = pickRandomHeading();
    const ticks = BEHAVIOR_TICK_MIN + Math.floor(Math.random() * (BEHAVIOR_TICK_MAX - BEHAVIOR_TICK_MIN + 1));

    agents.push({
      user_id: crypto.randomUUID(),
      x: center.x,
      y: center.y,
      target_x: center.x,
      target_y: center.y,
      cell_x: cx,
      cell_y: cy,
      target_cell_x: cx,
      target_cell_y: cy,
      path: [],
      move_speed: 1.8,
      state: "wandering",
      active_message: null,
      conversation_id: null,
      cooldown_until: null,
      behavior: "wander",
      behavior_ticks_remaining: ticks,
      heading
    });
  }

  return agents;
}

// Render a visual map of the grid (zoomed to the active area)
function renderMap(agents: AgentPosition[], tick: number) {
  // Find bounds of all agents
  let minX = WORLD_GRID_COLUMNS, maxX = 0, minY = WORLD_GRID_ROWS, maxY = 0;
  for (const a of agents) {
    const cx = a.cell_x ?? 0;
    const cy = a.cell_y ?? 0;
    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;
  }
  // Add padding
  minX = Math.max(0, minX - 2);
  maxX = Math.min(WORLD_GRID_COLUMNS - 1, maxX + 2);
  minY = Math.max(0, minY - 2);
  maxY = Math.min(WORLD_GRID_ROWS - 1, maxY + 2);

  // Build lookup
  const lookup = new Map<string, AgentPosition>();
  for (const a of agents) {
    lookup.set(`${a.cell_x}:${a.cell_y}`, a);
  }

  const headingArrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

  // Stats
  const wandering = agents.filter(a => a.state === "wandering").length;
  const idle = agents.filter(a => a.state === "idle").length;
  const chatting = agents.filter(a => a.state === "chatting").length;
  const cooldown = agents.filter(a => a.state === "cooldown").length;

  console.log(`\n═══ Tick ${tick} ═══  W:${wandering} I:${idle} C:${chatting} CD:${cooldown}  grid:[${minX}-${maxX}]x[${minY}-${maxY}]`);

  // Column headers
  let header = "   ";
  for (let x = minX; x <= maxX; x++) {
    header += (x % 5 === 0) ? String(x).padStart(2) : " .";
  }
  console.log(header);

  for (let y = minY; y <= maxY; y++) {
    let row = String(y).padStart(2) + " ";
    for (let x = minX; x <= maxX; x++) {
      const agent = lookup.get(`${x}:${y}`);
      if (!agent) {
        row += " ·";
      } else if (agent.state === "chatting") {
        row += " 💬";
      } else if (agent.state === "idle") {
        row += " ◆";
      } else if (agent.state === "cooldown") {
        row += " ○";
      } else {
        // Wandering — show heading arrow
        const arrow = headingArrows[agent.heading ?? 0];
        row += " " + arrow;
      }
    }
    console.log(row);
  }
}

// Run simulation
let agents = spawnAgents(AGENT_COUNT);
console.log(`Simulating ${AGENT_COUNT} agents for ${TICKS} ticks on a ${WORLD_GRID_COLUMNS}x${WORLD_GRID_ROWS} grid`);
console.log(`Legend: ↑↗→↘↓↙←↖ = wandering (heading)  ◆ = idle  💬 = chatting  ○ = cooldown`);

const conversationLog: Array<{ tick: number; pair: string }> = [];
// Track conversation start times so we can auto-end them
const activeConvos = new Map<string, { startTick: number; partnerId: string }>();

// Show initial state
renderMap(agents, 0);

for (let t = 1; t <= TICKS; t++) {
  // Auto-end conversations that have lasted CONVO_DURATION_TICKS
  const now = new Date(Date.now() + t * 1000);
  for (const [userId, convo] of activeConvos) {
    if (t - convo.startTick >= CONVO_DURATION_TICKS) {
      const idx = agents.findIndex(a => a.user_id === userId);
      if (idx >= 0) {
        agents[idx] = endConversation(agents[idx], now);
      }
      activeConvos.delete(userId);
    }
  }

  const result = tickWorld(agents, now);
  agents = result.positions;

  for (const convo of result.startedConversations) {
    conversationLog.push({ tick: t, pair: `${convo.agentA.slice(-4)}-${convo.agentB.slice(-4)}` });
    activeConvos.set(convo.agentA, { startTick: t, partnerId: convo.agentB });
    activeConvos.set(convo.agentB, { startTick: t, partnerId: convo.agentA });
  }

  // Show every 10 ticks, or when something happens
  if (t % 20 === 0 || result.startedConversations.length > 0 || t === TICKS) {
    renderMap(agents, t);
  }
}

// Summary
console.log("\n═══ Simulation Summary ═══");
console.log(`Ticks: ${TICKS}`);
console.log(`Conversations started: ${conversationLog.length}`);
for (const entry of conversationLog) {
  console.log(`  tick ${entry.tick}: ${entry.pair}`);
}

const finalStates = {
  wandering: agents.filter(a => a.state === "wandering").length,
  idle: agents.filter(a => a.state === "idle").length,
  chatting: agents.filter(a => a.state === "chatting").length,
  cooldown: agents.filter(a => a.state === "cooldown").length
};
console.log(`Final states:`, finalStates);

// Movement analysis: how far did agents spread from center?
const centerX = WORLD_GRID_COLUMNS / 2;
const centerY = WORLD_GRID_ROWS / 2;
const distances = agents.map(a => Math.hypot((a.cell_x ?? 0) - centerX, (a.cell_y ?? 0) - centerY));
const avgDist = distances.reduce((s, d) => s + d, 0) / distances.length;
const maxDist = Math.max(...distances);
console.log(`Spread from center: avg=${avgDist.toFixed(1)} max=${maxDist.toFixed(1)} cells`);
