import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Users, Layers, AlertTriangle, CheckCircle2 } from "lucide-react";
import "./App.css";

const ROLES = ["FSE", "Data Engineer", "AI Engineer", "Designer"];
const ROLE_COLORS = {
  "FSE": { bg: "#E6F1FB", text: "#0C447C", bar: "#378ADD" },
  "Data Engineer": { bg: "#E1F5EE", text: "#085041", bar: "#1D9E75" },
  "AI Engineer": { bg: "#FAECE7", text: "#712B13", bar: "#D85A30" },
  "Designer": { bg: "#EEEDFE", text: "#3C3489", bar: "#7F77DD" },
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

  return { scheduled, sprintLoad, totalSprints: sprint - 1, stuckEpicIds };
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

function StatTile({ label, value, accent }) {
  return (
    <div className="lr-card lr-stat" style={{ padding: "12px 14px" }}>
      <div className="lr-stat-value" style={{ color: accent || "#1F3A5F" }}>{value}</div>
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
                background: "#EEEEEA",
                outline: overSubscribed ? "2px solid #E24B4A" : "none", outlineOffset: -2,
              }}
            >
              <div style={{
                position: "absolute", inset: 0, width: `${pct}%`,
                background: overSubscribed ? "#E24B4A" : c.bar, borderRadius: 4,
              }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LumeriaRoadmap() {
  const [team, setTeam] = useState(TEAM_DEFAULT);
  const [activeEpics, setActiveEpics] = useState(EPICS_DEFAULT.map((e) => e.id));
  const [expandedEpic, setExpandedEpic] = useState(null);

  const epics = useMemo(
    () => EPICS_DEFAULT.filter((e) => activeEpics.includes(e.id)),
    [activeEpics]
  );

  const { scheduled, sprintLoad, totalSprints, stuckEpicIds } = useMemo(
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
  const teamSize = ROLES.reduce((sum, r) => sum + team[r].count, 0);

  let statusValue = "On track";
  let statusLabel = "capacity holds";
  let statusAccent = "#0F6E56";
  if (epics.length === 0) {
    statusValue = "No scope";
    statusLabel = "add epics to see status";
    statusAccent = "#888";
  } else if (stuckEpicIds.length > 0) {
    statusValue = "Stuck";
    statusLabel = `${stuckEpicIds.length} epic${stuckEpicIds.length > 1 ? "s" : ""} blocked`;
    statusAccent = "#A32D2D";
  } else if (anyOverbooked) {
    statusValue = "Tight";
    statusLabel = "some sprints over-subscribed";
    statusAccent = "#B25A1F";
  }

  return (
    <div className="lr-page">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: 1, color: "#888", fontWeight: 600, marginBottom: 4 }}>
          LUMERIA CLIMATE PLATFORM
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0, color: "#1F3A5F" }}>Roadmap Navigator</h1>
        <p style={{ color: "#666", fontSize: 14, marginTop: 6, maxWidth: 640 }}>
          Live capacity-based roadmap. Toggle team and scope below — the timeline and
          capacity bars recalculate immediately.
        </p>
      </div>

      <div className="lr-stats">
        <StatTile label="People on team" value={teamSize} />
        <StatTile label="Epics in scope" value={`${epics.length}/${EPICS_DEFAULT.length}`} />
        <StatTile label={`~${totalSprints * SPRINT_WEEKS} weeks`} value={`${totalSprints} sprints`} />
        <StatTile label={statusLabel} value={statusValue} accent={statusAccent} />
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
                  <span style={{ fontSize: 12, color: "#888" }}>
                    {active ? `×${TEAM_DEFAULT[role].count}` : "off"}
                  </span>
                </label>
              );
            })}
            <div style={{ fontSize: 11, color: "#999", marginTop: 10, borderTop: "1px solid #EEE", paddingTop: 8 }}>
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
              marginTop: 16, background: "#FCEBEB", color: "#791F1F", fontSize: 12,
              padding: "10px 12px", borderRadius: 8, display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {[...overSubscribedRoles].join(", ")} {overSubscribedRoles.size > 1 ? "are" : "is"} more in
                demand than the team can cover in at least one sprint, pushing work later. See "+waiting" bars below.
              </span>
            </div>
          )}

          {stuckEpicIds.length > 0 && (
            <div style={{
              marginTop: 16, background: "#FCEBEB", color: "#791F1F", fontSize: 12,
              padding: "10px 12px", borderRadius: 8, display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {stuckEpicIds.length} epic{stuckEpicIds.length > 1 ? "s" : ""} marked "stuck" can't progress at
                all — either a role they need has zero capacity, or they depend (directly or transitively) on
                an epic that's out of scope. Check team capacity and dependency chains above.
              </span>
            </div>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Timeline</div>

          {epics.length === 0 && (
            <div style={{ color: "#999", fontSize: 13, padding: 20, textAlign: "center", border: "1px dashed #E3E1D8", borderRadius: 10 }}>
              No epics in scope. Toggle at least one on the left.
            </div>
          )}

          {epics.map((epic) => {
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
                      <span style={{ fontSize: 11, color: "#A32D2D" }}>dependency missing</span>
                    ) : sprintDone ? (
                      <span style={{ fontSize: 11, color: "#0F6E56", display: "flex", alignItems: "center", gap: 4 }}>
                        <CheckCircle2 size={13} /> sprint {sprintDone}
                      </span>
                    ) : isStuck ? (
                      <span style={{ fontSize: 11, color: "#A32D2D" }}>stuck</span>
                    ) : (
                      <span style={{ fontSize: 11, color: "#999" }}>unscheduled</span>
                    )}
                    {Object.keys(epic.roles).map((r) => (
                      <span key={r} style={{ width: 8, height: 8, borderRadius: "50%", background: ROLE_COLORS[r].bar, display: "inline-block" }} />
                    ))}
                  </div>
                </button>
                {isExpanded && (
                  <div style={{ padding: "12px 14px", borderTop: "1px solid #E3E1D8" }}>
                    {epic.dependsOn.length > 0 && (
                      <div style={{ fontSize: 11.5, color: "#888", marginBottom: 10 }}>
                        Depends on: {epic.dependsOn.map((d) => EPICS_DEFAULT.find((x) => x.id === d)?.name).join(", ")}
                      </div>
                    )}
                    {epic.features.map((f, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < epic.features.length - 1 ? "1px solid #F0EFE9" : "none" }}>
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
                      <div key={s.sprint} style={{ flex: 1, textAlign: "center", fontSize: 9, color: "#AAA" }}>
                        {s.sprint}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: "#999", marginTop: 10, borderTop: "1px solid #EEE", paddingTop: 8 }}>
                  Fill shows how much of that sprint's capacity is used. Red outline = more work is ready than
                  the role can fit, pushing some into a later sprint. Hover a cell for exact numbers.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
