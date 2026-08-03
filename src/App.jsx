import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, Users, Layers, AlertTriangle, CheckCircle2 } from "lucide-react";
import "./App.css";

const ROLES = ["FSE", "Data Engineer", "AI Engineer", "Designer"];
// Categorical palette validated for dark surfaces (order matters — see dataviz skill validator)
const ROLE_COLORS = {
  "FSE": { bg: "rgba(57, 135, 229, 0.18)", text: "#9CC2F5", bar: "#3987E5" },
  "AI Engineer": { bg: "rgba(217, 89, 38, 0.20)", text: "#F0A87D", bar: "#D95926" },
  "Data Engineer": { bg: "rgba(25, 158, 112, 0.18)", text: "#7FD4B4", bar: "#199E70" },
  "Designer": { bg: "rgba(144, 133, 233, 0.20)", text: "#C4BCF5", bar: "#9085E9" },
};

// Status palette — fixed, never themed by role/series color (dataviz skill)
const STATUS = {
  good: "#0CA30C",
  warning: "#FAB219",
  critical: "#D03B3B",
  neutral: "var(--text-dim)",
};

const TEAM_DEFAULT = {
  "FSE": { count: 2, weeklyCapacity: 1.6 },
  "Data Engineer": { count: 1, weeklyCapacity: 1.6 },
  "AI Engineer": { count: 1, weeklyCapacity: 1.6 },
  "Designer": { count: 1, weeklyCapacity: 1.6 },
};

const EPICS_DEFAULT = [
  {
    id: "geo-visualizer",
    name: "Geospatial Data Visualizer",
    dependsOn: [],
    roles: { "FSE": 8, "Data Engineer": 3 },
    features: [
      { name: "Map rendering base layer", roles: { "FSE": 3 } },
      { name: "Heatwave / flood overlays", roles: { "FSE": 3, "Data Engineer": 3 } },
      { name: "Neighborhood boundary layer", roles: { "FSE": 2 } },
    ],
  },
  {
    id: "risk-insights",
    name: "Geospatial Risk Insights by Neighborhood",
    dependsOn: ["geo-visualizer"],
    roles: { "Data Engineer": 8, "AI Engineer": 5 },
    features: [
      { name: "Risk scoring pipeline", roles: { "Data Engineer": 5 } },
      { name: "Neighborhood risk model", roles: { "AI Engineer": 5 } },
      { name: "Risk insights panel UI", roles: { "Data Engineer": 3 } },
    ],
  },
  {
    id: "ai-mitigation",
    name: "AI Implementation Plans for Risk Mitigation",
    dependsOn: ["risk-insights"],
    roles: { "AI Engineer": 7, "FSE": 2 },
    features: [
      { name: "Mitigation recommendation engine", roles: { "AI Engineer": 5 } },
      { name: "Human-review workflow", roles: { "AI Engineer": 2, "FSE": 2 } },
    ],
  },
  {
    id: "stakeholder-reporting",
    name: "Stakeholder Reporting & Onboarding",
    dependsOn: ["ai-mitigation"],
    roles: { "Designer": 3, "FSE": 1 },
    features: [
      { name: "Board-facing summary view", roles: { "Designer": 2 } },
      { name: "City onboarding walkthrough", roles: { "Designer": 1, "FSE": 1 } },
    ],
  },
];

const BUFFER = 0.18;
const SPRINT_WEEKS = 2;

function computeSprints(epics, team) {
  const remainingByRole = {};
  ROLES.forEach((r) => { remainingByRole[r] = 0; });

  const perSprintCapacity = {};
  ROLES.forEach((r) => {
    const t = team[r];
    perSprintCapacity[r] = t ? t.count * t.weeklyCapacity * SPRINT_WEEKS : 0;
  });

  const done = new Set();
  const scheduled = {};
  const started = {};
  let sprint = 1;
  const maxSprints = 30;
  const remaining = epics.map((e) => ({
    ...e,
    remaining: Object.fromEntries(ROLES.map((r) => [r, (e.roles[r] || 0) * (1 + BUFFER)])),
  }));

  const sprintLoad = [];
  let stuck = false;

  while (remaining.some((e) => !done.has(e.id)) && sprint <= maxSprints) {
    const loadThisSprint = Object.fromEntries(ROLES.map((r) => [r, 0]));
    const demandThisSprint = Object.fromEntries(ROLES.map((r) => [r, 0]));
    let capLeft = { ...perSprintCapacity };
    let anyProgress = false;

    for (const epic of remaining) {
      if (done.has(epic.id)) continue;
      const blocked = epic.dependsOn.some((d) => !done.has(d));
      if (blocked) continue;

      for (const role of ROLES) {
        if (epic.remaining[role] > 0) {
          demandThisSprint[role] += epic.remaining[role];
          const use = Math.min(epic.remaining[role], capLeft[role]);
          if (use > 0) {
            epic.remaining[role] -= use;
            capLeft[role] -= use;
            loadThisSprint[role] += use;
            anyProgress = true;
            if (started[epic.id] === undefined) started[epic.id] = sprint;
          }
        }
      }
      const finished = ROLES.every((r) => epic.remaining[r] <= 0.001);
      if (finished && !done.has(epic.id)) {
        done.add(epic.id);
        scheduled[epic.id] = sprint;
      }
    }

    if (!anyProgress) {
      stuck = true;
      break;
    }

    sprintLoad.push({ sprint, load: loadThisSprint, demand: demandThisSprint, capacity: perSprintCapacity });
    sprint += 1;
  }

  const stuckEpicIds = stuck ? remaining.filter((e) => !done.has(e.id)).map((e) => e.id) : [];

  return { scheduled, started, sprintLoad, totalSprints: sprint - 1, stuckEpicIds };
}

function RoleBadge({ role, size = "sm", style }) {
  const c = ROLE_COLORS[role];
  return (
    <span style={{
      background: c.bg, color: c.text, fontSize: size === "sm" ? 11 : 12,
      padding: "2px 8px", borderRadius: 20, fontWeight: 500, whiteSpace: "nowrap",
      ...style,
    }}>{role}</span>
  );
}

function StatTile({ kicker, label, value, accent }) {
  return (
    <div className="lr-card lr-stat" style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 10, letterSpacing: 0.5, color: "var(--text-faint)", fontWeight: 600, marginBottom: 4, textTransform: "uppercase" }}>
        {kicker}
      </div>
      <div className="lr-stat-value" style={{ color: accent || "var(--text)" }}>{value}</div>
      <div className="lr-stat-label">{label}</div>
    </div>
  );
}

function CapacityStripRow({ role, sprintLoad }) {
  const c = ROLE_COLORS[role];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div className="lr-role-col" title={role}>
        <RoleBadge role={role} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }} />
      </div>
      <div style={{ flex: 1, display: "flex", gap: 2 }}>
        {sprintLoad.map((s) => {
          const used = s.load[role];
          const demand = s.demand[role];
          const capacity = s.capacity[role];
          const pct = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0;
          const overSubscribed = demand > capacity + 0.01;
          const title = `Sprint ${s.sprint} · ${role}: ${used.toFixed(1)} / ${capacity.toFixed(1)} pw used` +
            (overSubscribed ? ` (+${(demand - capacity).toFixed(1)} pw waiting)` : "");
          return (
            <div
              key={s.sprint}
              title={title}
              style={{
                flex: 1, height: 18, borderRadius: 4, position: "relative", overflow: "hidden",
                background: "var(--track-bg)",
                outline: overSubscribed ? "2px solid var(--danger-strong)" : "none", outlineOffset: -2,
              }}
            >
              <div style={{
                position: "absolute", inset: 0, width: `${pct}%`,
                background: overSubscribed ? "var(--danger-strong)" : c.bar, borderRadius: 4,
              }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function RoleLegend() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14 }}>
      {ROLES.map((r) => (
        <div key={r} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: ROLE_COLORS[r].bar, display: "inline-block" }} />
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{r}</span>
        </div>
      ))}
    </div>
  );
}

const ROW_HEIGHT = 34;
const ROW_GAP = 18;
const ROW_STEP = ROW_HEIGHT + ROW_GAP;
const MIN_COL_WIDTH = 56;

function RoadmapChart({ epics, activeEpics, scheduled, started, stuckEpicIds, totalSprints }) {
  const [gridRef, gridWidth] = useElementWidth();
  const hasOverflow = stuckEpicIds.length > 0;
  const totalCols = Math.max(totalSprints, 1) + (hasOverflow ? 1 : 0);
  const colWidth = gridWidth / totalCols;
  const chartHeight = epics.length * ROW_STEP - ROW_GAP;

  const rowIndex = Object.fromEntries(epics.map((e, i) => [e.id, i]));

  const connectors = [];
  epics.forEach((epic) => {
    epic.dependsOn.forEach((depId) => {
      if (!(depId in rowIndex)) return;
      const depFinish = scheduled[depId];
      if (depFinish == null) return;
      const myStart = started[epic.id] ?? scheduled[epic.id];
      const x1 = depFinish * colWidth;
      const y1 = rowIndex[depId] * ROW_STEP + ROW_HEIGHT / 2;
      const x2 = myStart != null ? (myStart - 1) * colWidth : x1;
      const y2 = rowIndex[epic.id] * ROW_STEP + ROW_HEIGHT / 2;
      const midX = (x1 + x2) / 2;
      connectors.push({ key: `${depId}->${epic.id}`, d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}` });
    });
  });

  return (
    <div className="lr-card" style={{ padding: "18px 20px" }}>
      <RoleLegend />

      <div style={{ display: "flex" }}>
        <div className="lr-roadmap-labels" style={{ flexShrink: 0 }}>
          {epics.map((epic) => (
            <div key={epic.id} style={{ height: ROW_STEP, display: "flex", alignItems: "center" }}>
              <span style={{
                fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", paddingRight: 12,
              }} title={epic.name}>
                {epic.name}
              </span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflowX: "auto" }}>
          <div style={{ display: "flex", minWidth: totalCols * MIN_COL_WIDTH }}>
            {Array.from({ length: totalCols }).map((_, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 10.5, color: "var(--text-faint)", fontWeight: 600, paddingBottom: 8 }}>
                {i < totalSprints ? i + 1 : "…"}
              </div>
            ))}
          </div>

          <div ref={gridRef} style={{ position: "relative", height: chartHeight, minWidth: totalCols * MIN_COL_WIDTH }}>
          <div style={{ position: "absolute", inset: 0, display: "flex" }}>
            {Array.from({ length: totalCols }).map((_, i) => (
              <div key={i} style={{ flex: 1, borderLeft: i > 0 ? "1px solid var(--border-soft)" : "none" }} />
            ))}
          </div>

          {gridWidth > 0 && (
            <svg
              width={gridWidth} height={chartHeight}
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
              {connectors.map((c) => (
                <path key={c.key} d={c.d} fill="none" stroke="var(--text-faint)" strokeWidth={1.5} strokeDasharray="3 3" />
              ))}
            </svg>
          )}

          {gridWidth > 0 && epics.map((epic, i) => {
            const blockedByMissing = epic.dependsOn.some((d) => !activeEpics.includes(d));
            const finish = scheduled[epic.id];
            const start = started[epic.id];
            const isStuck = finish == null && !blockedByMissing && stuckEpicIds.includes(epic.id);
            const top = i * ROW_STEP + (ROW_HEIGHT - 20) / 2;

            let left, width, color, dashed = false, fade = false, label;
            if (finish != null) {
              left = (start - 1) * colWidth;
              width = Math.max((finish - start + 1) * colWidth - 4, 10);
              color = STATUS.good;
              label = start === finish ? `Sprint ${start}` : `Sprints ${start}–${finish}`;
            } else if (isStuck && start != null) {
              left = (start - 1) * colWidth;
              width = Math.max((totalCols - (start - 1)) * colWidth - 4, 10);
              color = STATUS.critical;
              fade = true;
              label = `Stuck since sprint ${start}`;
            } else {
              left = 0;
              width = Math.max(colWidth - 4, 10);
              color = STATUS.neutral;
              dashed = true;
              label = blockedByMissing ? "Dependency out of scope" : "Not scheduled";
            }

            return (
              <div
                key={epic.id}
                title={`${epic.name} — ${label}`}
                style={{
                  position: "absolute", top, left, width, height: 20, borderRadius: 5,
                  background: dashed ? "transparent" : color,
                  border: dashed ? `1.5px dashed ${color}` : "none",
                  maskImage: fade ? "linear-gradient(to right, black 75%, transparent 100%)" : "none",
                  display: "flex", alignItems: "center", gap: 5, paddingLeft: 6, overflow: "hidden",
                }}
              >
                {!dashed && Object.keys(epic.roles).map((r) => (
                  <span key={r} style={{ width: 6, height: 6, borderRadius: "50%", background: ROLE_COLORS[r].bar, flexShrink: 0, filter: "brightness(1.6)" }} />
                ))}
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LumeriaRoadmap() {
  const [team, setTeam] = useState(TEAM_DEFAULT);
  const [activeEpics, setActiveEpics] = useState(EPICS_DEFAULT.map((e) => e.id));
  const [expandedEpic, setExpandedEpic] = useState(null);
  const [view, setView] = useState("roadmap");

  const epics = useMemo(
    () => EPICS_DEFAULT.filter((e) => activeEpics.includes(e.id)),
    [activeEpics]
  );

  const { scheduled, started, sprintLoad, totalSprints, stuckEpicIds } = useMemo(
    () => computeSprints(epics, team),
    [epics, team]
  );

  const toggleRole = (role) => {
    setTeam((prev) => {
      const next = { ...prev };
      if (next[role].count > 0) {
        next[role] = { ...next[role], count: 0 };
      } else {
        next[role] = { ...next[role], count: TEAM_DEFAULT[role].count };
      }
      return next;
    });
  };

  const toggleEpic = (id) => {
    setActiveEpics((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const overSubscribedRoles = new Set(
    sprintLoad.flatMap((s) => ROLES.filter((r) => s.demand[r] > s.capacity[r] + 0.01))
  );
  const anyOverbooked = overSubscribedRoles.size > 0;
  const overSubscribedDetails = ROLES.filter((r) => team[r].count > 0)
    .map((r) => ({
      role: r,
      sprints: sprintLoad.filter((s) => s.demand[r] > s.capacity[r] + 0.01).map((s) => s.sprint),
    }))
    .filter((d) => d.sprints.length > 0);
  const teamSize = ROLES.reduce((sum, r) => sum + team[r].count, 0);

  let statusValue = "On track";
  let statusLabel = "capacity holds";
  let statusAccent = "var(--success)";
  if (epics.length === 0) {
    statusValue = "No scope";
    statusLabel = "add epics to see status";
    statusAccent = "var(--text-dim)";
  } else if (stuckEpicIds.length > 0) {
    statusValue = "Stuck";
    statusLabel = `${stuckEpicIds.length} epic${stuckEpicIds.length > 1 ? "s" : ""} blocked`;
    statusAccent = "var(--danger-strong)";
  } else if (anyOverbooked) {
    statusValue = "Tight";
    statusLabel = "some sprints over-subscribed";
    statusAccent = "var(--warning)";
  }

  return (
    <div className="lr-page">
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, letterSpacing: 1, color: "var(--text-dim)", fontWeight: 600, marginBottom: 4 }}>
          LUMERIA CLIMATE PLATFORM
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, color: "var(--text)" }}>Roadmap Navigator</h1>
        <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 6, maxWidth: 640 }}>
          Live capacity-based roadmap. Toggle team and scope below — the timeline and
          capacity bars recalculate immediately.
        </p>
      </div>

      <div className="lr-stats">
        <StatTile kicker="Team" value={teamSize} label="people" />
        <StatTile kicker="Scope" value={`${epics.length}/${EPICS_DEFAULT.length}`} label="epics" />
        <StatTile kicker="Timeline" value={`${totalSprints} sprints`} label={`~${totalSprints * SPRINT_WEEKS} weeks`} />
        <StatTile kicker="Status" label={statusLabel} value={statusValue} accent={statusAccent} />
      </div>

      <div className="lr-layout">
        {/* LEFT PANEL */}
        <div>
          <div className="lr-card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
              <Users size={15} /> Team
            </div>
            {ROLES.map((role) => {
              const active = team[role].count > 0;
              return (
                <label key={role} className="lr-row" style={{
                  justifyContent: "space-between", opacity: active ? 1 : 0.45,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={active} onChange={() => toggleRole(role)} />
                    <RoleBadge role={role} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    {active ? `×${TEAM_DEFAULT[role].count}` : "off"}
                  </span>
                </label>
              );
            })}
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 10, borderTop: "1px solid var(--border-soft)", paddingTop: 8 }}>
              Baseline: 1.6 effective person-weeks / role / sprint. +18% risk buffer applied.
            </div>
          </div>

          <div className="lr-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
              <Layers size={15} /> Scope
            </div>
            {EPICS_DEFAULT.map((e) => (
              <label key={e.id} className="lr-row" style={{
                alignItems: "flex-start", opacity: activeEpics.includes(e.id) ? 1 : 0.45,
              }}>
                <input
                  type="checkbox"
                  checked={activeEpics.includes(e.id)}
                  onChange={() => toggleEpic(e.id)}
                  style={{ marginTop: 3 }}
                />
                <span style={{ fontSize: 12.5, lineHeight: 1.4, marginLeft: 8 }}>{e.name}</span>
              </label>
            ))}
          </div>

          {anyOverbooked && (
            <div style={{
              marginTop: 16, background: "var(--danger-bg)", color: "var(--text)", fontSize: 12,
              padding: "10px 12px", borderRadius: 8, display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <AlertTriangle size={15} color="var(--danger-strong)" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {[...overSubscribedRoles].join(", ")} {overSubscribedRoles.size > 1 ? "are" : "is"} more in
                demand than the team can cover in at least one sprint, so that work gets pushed to a later
                sprint. See the over capacity list under "Capacity by sprint" below for exactly where.
              </span>
            </div>
          )}

          {stuckEpicIds.length > 0 && (
            <div style={{
              marginTop: 16, background: "var(--danger-bg)", color: "var(--text)", fontSize: 12,
              padding: "10px 12px", borderRadius: 8, display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <AlertTriangle size={15} color="var(--danger-strong)" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {stuckEpicIds.length} epic{stuckEpicIds.length > 1 ? "s" : ""} marked "stuck" can't progress at
                all — either a role they need has zero capacity, or they depend (directly or transitively) on
                an epic that's out of scope. Check team capacity and dependency chains above.
              </span>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Timeline</div>
            <div className="lr-seg">
              <button className={view === "roadmap" ? "active" : ""} onClick={() => setView("roadmap")}>Roadmap</button>
              <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List</button>
            </div>
          </div>

          {epics.length === 0 && (
            <div style={{ color: "var(--text-dim)", fontSize: 13, padding: 20, textAlign: "center", border: "1px dashed var(--border)", borderRadius: 10 }}>
              No epics in scope. Toggle at least one on the left.
            </div>
          )}

          {epics.length > 0 && view === "roadmap" && (
            <div style={{ marginBottom: 20 }}>
              <RoadmapChart
                epics={epics}
                activeEpics={activeEpics}
                scheduled={scheduled}
                started={started}
                stuckEpicIds={stuckEpicIds}
                totalSprints={totalSprints}
              />
            </div>
          )}

          {view === "list" && epics.map((epic) => {
            const isExpanded = expandedEpic === epic.id;
            const sprintDone = scheduled[epic.id];
            const blockedByMissing = epic.dependsOn.some((d) => !activeEpics.includes(d));
            const isStuck = !sprintDone && !blockedByMissing && stuckEpicIds.includes(epic.id);
            return (
              <div key={epic.id} className="lr-card" style={{ marginBottom: 10 }}>
                <button
                  onClick={() => setExpandedEpic(isExpanded ? null : epic.id)}
                  aria-expanded={isExpanded}
                  className="lr-epic-btn"
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span style={{ fontWeight: 500, fontSize: 13.5 }}>{epic.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {blockedByMissing ? (
                      <span style={{ fontSize: 11, color: "var(--danger-strong)" }}>dependency missing</span>
                    ) : sprintDone ? (
                      <span style={{ fontSize: 11, color: "var(--success)", display: "flex", alignItems: "center", gap: 4 }}>
                        <CheckCircle2 size={13} /> sprint {sprintDone}
                      </span>
                    ) : isStuck ? (
                      <span style={{ fontSize: 11, color: "var(--danger-strong)" }}>stuck</span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>unscheduled</span>
                    )}
                    {Object.keys(epic.roles).map((r) => (
                      <span key={r} style={{ width: 8, height: 8, borderRadius: "50%", background: ROLE_COLORS[r].bar, display: "inline-block" }} />
                    ))}
                  </div>
                </button>
                {isExpanded && (
                  <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
                    {epic.dependsOn.length > 0 && (
                      <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 10 }}>
                        Depends on: {epic.dependsOn.map((d) => EPICS_DEFAULT.find((x) => x.id === d)?.name).join(", ")}
                      </div>
                    )}
                    {epic.features.map((f, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < epic.features.length - 1 ? "1px solid var(--border-soft)" : "none" }}>
                        <span style={{ fontSize: 12.5 }}>{f.name}</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {Object.entries(f.roles).map(([r, w]) => (
                            <span key={r} style={{ fontSize: 10.5, color: ROLE_COLORS[r].text, background: ROLE_COLORS[r].bg, padding: "1px 6px", borderRadius: 10 }}>
                              {r} {w}pw
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {sprintLoad.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Capacity by sprint</div>
              <div className="lr-card" style={{ padding: "14px 16px" }}>
                {ROLES.filter((r) => team[r].count > 0).map((r) => (
                  <CapacityStripRow key={r} role={r} sprintLoad={sprintLoad} />
                ))}
                <div style={{ display: "flex", gap: 10 }}>
                  <div className="lr-role-col" />
                  <div style={{ flex: 1, display: "flex", gap: 2 }}>
                    {sprintLoad.map((s) => (
                      <div key={s.sprint} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "var(--text-faint)" }}>
                        {s.sprint}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 10, borderTop: "1px solid var(--border-soft)", paddingTop: 8 }}>
                  Fill shows how much of that sprint's capacity is used. A red outline marks a sprint where more
                  work was ready than the role could fit that sprint — hover a cell to see exactly how much.
                </div>
                {overSubscribedDetails.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--danger-strong)", marginTop: 8 }}>
                    <strong>Over capacity:</strong>{" "}
                    {overSubscribedDetails.map((d) => (
                      <span key={d.role} style={{ marginRight: 10 }}>
                        {d.role} — sprint{d.sprints.length > 1 ? "s" : ""} {d.sprints.join(", ")}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
