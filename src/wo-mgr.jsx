import { useState, useEffect, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   PARSER
══════════════════════════════════════════════════════════════════════════ */
function stripEmoji(s) {
  return s.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]+/gu, "").trim();
}
function extractEmoji(s) {
  const m = s.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]+/gu);
  return m ? m.join("") : "";
}
function cap(s) {
  if (!s) return "";
  return s.split(" ").map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "").join(" ");
}
function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function parseList(raw) {
  const lines = raw.split("\n");
  let section = "players";
  const players = [], goalkeepers = [], absent = [];
  let title = "";
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^LISTA[- ]FUTEBOL/i.test(t)) { title = t; continue; }
    if (/^GOLEIROS?$/i.test(t)) { section = "gk"; continue; }
    if (/^AUSENTES?$/i.test(t)) { section = "absent"; continue; }
    const m = t.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const name = stripEmoji(m[2]);
    if (!name) continue;
    const emoji = extractEmoji(m[2]);
    if (section === "players") players.push({ name });
    else if (section === "gk") goalkeepers.push({ name });
    else absent.push({ name, emoji });
  }
  return { title, players, goalkeepers, absent };
}

/* ══════════════════════════════════════════════════════════════════════════
   TEAM LOGIC

   RULES (definitive):
   ─────────────────────────────────────────────────────────────────────
   1. Sort ALL present outfield players by arrival time (ascending).
   2. The first (numTeams × perTeam) players are the "eligible starters".
      Within that group, shuffle randomly to assign to teams.
      → Arrival order guarantees the right people play, shuffle decides teams.
   3. Players beyond the starter count → queue, ordered by arrival (FIFO).
   4. Goalkeepers: 1 per team, assigned in arrival order (no shuffle).
      Late GKs: join GK bench.
   5. "Late" (after kickoff): they are simply further back in the arrival
      sort, so they naturally end up in the queue. No special branch needed
      unless we want to label them visually.
   ─────────────────────────────────────────────────────────────────────
══════════════════════════════════════════════════════════════════════════ */

const TEAM_META = [
  { name: "Time Laranja", color: "#ff6b1a", bg: "#ff6b1a14" },
  { name: "Time Preto", color: "#dadada", bg: "#d6d6d614" },
  { name: "Time C", color: "#4fc3f7", bg: "#4fc3f714" },
  { name: "Time D", color: "#ce93d8", bg: "#ce93d814" },
];

function buildTeams({ presence, parsed, numTeams, perTeam, kickoffISO }) {
  // Sort outfield players by arrival time
  const allPresent = [...parsed.players]
    .filter(p => presence[p.name])
    .sort((a, b) => new Date(presence[a.name]) - new Date(presence[b.name]));

  // Sort GKs by arrival
  const allGKs = [...parsed.goalkeepers]
    .filter(p => presence[p.name])
    .sort((a, b) => new Date(presence[a.name]) - new Date(presence[b.name]));

  const spotsOnField = numTeams * perTeam;

  // First N players are eligible starters
  const eligibleStarters = allPresent.slice(0, spotsOnField);
  // The rest wait — in arrival order
  const queue = allPresent.slice(spotsOnField);

  const nextOutPlayers = eligibleStarters
    .sort((a, b) => new Date(presence[b.name]) - new Date(presence[a.name]))
    .slice(0, queue.length);

  // Shuffle only the eligible starters (so teams are random but the right people play)
  const shuffled = [...eligibleStarters];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Build teams
  const teams = Array.from({ length: numTeams }, (_, i) => ({
    ...TEAM_META[i],
    players: [],
    goalkeeper: allGKs[i] || null,   // 1 GK per team, in arrival order
  }));

  shuffled.forEach((p, i) => teams[i % numTeams].players.push(p));

  // GKs beyond the starting teams
  const gkQueue = allGKs.slice(numTeams);

  const lateQueue = [...parsed.players]
    .filter(p => eligibleStarters.find(e => e.name == p.name) == null && kickoffISO && new Date(presence[p.name]) > new Date(kickoffISO))
    .sort((a, b) => new Date(presence[a.name]) - new Date(presence[b.name]));

  return { teams, queue, gkQueue, lateQueue, nextOutPlayers, totalOnField: eligibleStarters.length };
}

/* ══════════════════════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════════════════════ */
let _tid;
function useToast() {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => {
    setMsg(m); clearTimeout(_tid);
    _tid = setTimeout(() => setMsg(null), 2600);
  }, []);
  return [msg, show];
}

/* ══════════════════════════════════════════════════════════════════════════
   LOCALSTORAGE HELPERS
══════════════════════════════════════════════════════════════════════════ */
const LS_KEY = "womgr_v1";

function lsLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function lsSave(patch) {
  try {
    const current = lsLoad();
    localStorage.setItem(LS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch { /* storage full or unavailable */ }
}

/* ══════════════════════════════════════════════════════════════════════════
   APP
══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  // Hydrate initial state from localStorage (runs only once)
  const _ls = lsLoad();

  const [tab, setTab] = useState("input");
  const [raw, setRaw] = useState(_ls.raw ?? null);
  const [parsed, setParsed] = useState(_ls.parsed ?? null);
  const [presence, setPresence] = useState(_ls.presence ?? {}); // { name: isoString }
  const [numTeams, setNumTeams] = useState(_ls.numTeams ?? 2);
  const [perTeam, setPerTeam] = useState(_ls.perTeam ?? 5);
  const [kickoffStr, setKickoffStr] = useState(_ls.kickoffStr ?? ""); // "HH:MM"
  const [teamsData, setTeamsData] = useState(_ls.teamsData ?? null);
  const [toastMsg, showToast] = useToast();
  const [now, setNow] = useState(new Date());

  // Persist every relevant state change to localStorage
  useEffect(() => { lsSave({ raw }); }, [raw]);
  useEffect(() => { lsSave({ parsed }); }, [parsed]);
  useEffect(() => { lsSave({ presence }); }, [presence]);
  useEffect(() => { lsSave({ numTeams }); }, [numTeams]);
  useEffect(() => { lsSave({ perTeam }); }, [perTeam]);
  useEffect(() => { lsSave({ kickoffStr }); }, [kickoffStr]);
  useEffect(() => { lsSave({ teamsData }); }, [teamsData]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  /* kickoff as full ISO (today + HH:MM) */
  const kickoffISO = () => {
    if (!kickoffStr) return null;
    const [h, m] = kickoffStr.split(":").map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const kickoffDate = () => {
    const iso = kickoffISO(); return iso ? new Date(iso) : null;
  };
  const isGameLive = () => {
    const ko = kickoffDate(); return ko ? now >= ko : false;
  };
  const isLate = (name) => {
    const ko = kickoffDate();
    if (!ko || !presence[name]) return false;
    return new Date(presence[name]) > ko;
  };

  /* ── PARSE ── */
  const handleParse = () => {
    const p = parseList(raw);
    if (!p.players.length && !p.goalkeepers.length) {
      showToast("⚠️ Nenhum jogador encontrado!"); return;
    }
    setParsed(p); setPresence({}); setTeamsData(null);
    setTab("presence");
    showToast(`✅ ${p.players.length} jogadores · ${p.goalkeepers.length} goleiros`);
  };

  /* ── TOGGLE PRESENCE ── */
  const toggle = (name) => setPresence(prev => {
    const n = { ...prev };
    if (n[name]) delete n[name]; else n[name] = new Date().toISOString();
    return n;
  });

  const markAll = () => {
    if (!parsed) return;
    const ts = new Date().toISOString();
    setPresence(prev => {
      const n = { ...prev };
      [...parsed.players, ...parsed.goalkeepers].forEach(p => { if (!n[p.name]) n[p.name] = ts; });
      return n;
    });
    showToast("✅ Todos marcados!");
  };

  /* sorted present players */
  const sortedPresent = (pool) =>
    pool.filter(p => presence[p.name])
      .sort((a, b) => new Date(presence[a.name]) - new Date(presence[b.name]));

  /* ── GENERATE TEAMS ── */
  const genTeams = () => {
    if (!parsed) return;
    const pp = sortedPresent(parsed.players);
    if (pp.length < 2) { showToast("⚠️ Marque ao menos 2 presenças!"); return; }
    const result = buildTeams({ presence, parsed, numTeams, perTeam, kickoffISO: kickoffISO() });
    setTeamsData(result);
    setTab("teams");
    showToast("🔀 Times sorteados!");
  };

  /* ── COMPUTED FOR PRESENCE TAB ── */
  const spotsOnField = numTeams * perTeam;
  const sortedPlayers = parsed ? sortedPresent(parsed.players) : [];
  const sortedGKs = parsed ? sortedPresent(parsed.goalkeepers) : [];
  const totalPresent = sortedPlayers.length + sortedGKs.length;
  const totalCadastro = parsed ? parsed.players.length + parsed.goalkeepers.length : 0;

  /* arrival position label for a player */
  const arrivalLabel = (name, pool) => {
    const idx = pool.findIndex(p => p.name === name);
    if (idx < 0) return null;
    const pos = idx + 1; // 1-based rank in arrival order
    if (isLate(name)) return { cls: "pos-late", txt: `ATRASADO · ${pos}° a chegar` };
    if (pos <= spotsOnField) return { cls: "pos-in", txt: `${pos}° · TITULAR` };
    return { cls: "pos-queue", txt: `${pos}° · FILA #${pos - spotsOnField}` };
  };

  /* ════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════ */
  return (
    <>
      <div className="app">

        {/* HEADER */}
        <header className="hdr">
          <div className="hdr-meta">
            <div className="logo">W.O.<span>MGR</span></div>
            {parsed?.title && <div className="session-lbl">Sessão: <b>{parsed.title}</b></div>}
          </div>
          <span style={{ height: "60px", display: "flex", filter: "drop-shadow(0 0 14px #ff6b1a55)", marginLeft: "auto" }}><img src="./wo.png" /></span>
          <span className="hdr-ball">⚽</span>
        </header>

        {/* TABS */}
        <div className="tabs">
          {[["input", "📋 Lista"], ["presence", "✅ Presença"], ["teams", "⚽ Times"]].map(([id, lbl]) => (
            <button key={id} className={`t-btn${tab === id ? " on" : ""}`} onClick={() => setTab(id)}>{lbl}</button>
          ))}
        </div>

        <div className="wrap">

          {/* ══════ TAB: INPUT ══════ */}
          {tab === "input" && (
            <>
              <div className="card">
                <div className="card-title">📋 Colar Lista</div>
                <label>Cole a lista do grupo (com seções GOLEIROS e AUSENTES)</label>
                <textarea value={raw ?? ""} onChange={e => setRaw(e.target.value)} spellCheck={false} placeholder="Cole a lista do grupo (com seções GOLEIROS e AUSENTES)" />
                <div className="btn-row">
                  <button className="btn btn-primary" onClick={handleParse}>⚡ Processar Lista</button>
                  <button className="btn btn-ghost" onClick={() => { setRaw(""); setParsed(null); setPresence({}); setTeamsData(null); localStorage.removeItem(LS_KEY); }}>🗑️ Limpar</button>
                </div>
              </div>

              {parsed && (
                <div className="card">
                  <div className="card-title">👀 Prévia</div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, display: "flex", gap: 18, flexWrap: "wrap" }}>
                    <span>🏃 <b style={{ color: "var(--text)" }}>{parsed.players.length}</b> jogadores</span>
                    <span>🧤 <b style={{ color: "var(--text)" }}>{parsed.goalkeepers.length}</b> goleiros</span>
                    <span>❌ <b style={{ color: "var(--text)" }}>{parsed.absent.length}</b> ausentes</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {parsed.players.map((p, i) => <span key={i} className="pill">{cap(p.name)}</span>)}
                  </div>
                  {parsed.absent.length > 0 && (<>
                    <div className="divider" />
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 8, fontWeight: 700 }}>Ausentes confirmados</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {parsed.absent.map((p, i) => <span key={i} className="pill-abs">{cap(p.name)} {p.emoji}</span>)}
                    </div>
                  </>)}
                </div>
              )}
            </>
          )}

          {/* ══════ TAB: PRESENÇA ══════ */}
          {tab === "presence" && (
            !parsed ? (
              <div className="empty"><div className="empty-ico">📋</div>Processe uma lista primeiro!</div>
            ) : (
              <>
                {/* kickoff config */}
                <div className="card">
                  <div className="card-title">⏱️ Horário de Início</div>
                  <div className="info-note">
                    <b>Quem chega primeiro, joga primeiro.</b> Os <b>{spotsOnField} primeiros a chegar</b> são sorteados nos times titulares.
                    Quem chegar depois fica na fila por ordem de chegada. Atrasados (após o kickoff) entram no final da fila.
                  </div>
                  <div className="two-col">
                    <div>
                      <label>Hora do Kickoff</label>
                      <input type="time" value={kickoffStr} onChange={e => setKickoffStr(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                      {kickoffStr && (
                        <div className="ko-bar" style={{ margin: 0 }}>
                          <span style={{ fontSize: 22 }}>⏱️</span>
                          <div>
                            <div className="ko-label">Kickoff</div>
                            <div className="ko-time">{kickoffStr}</div>
                          </div>
                          <div className={`ko-status ${isGameLive() ? "ko-live" : "ko-pre"}`}>
                            {isGameLive() ? "🔴 Em jogo" : "🟡 Aguardando"}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* stats */}
                <div className="stats">
                  <div className="stat"><div className="stat-v">{totalCadastro}</div><div className="stat-l">Na lista</div></div>
                  <div className="stat"><div className="stat-v" style={{ color: "var(--orange)" }}>{totalPresent}</div><div className="stat-l">Presentes</div></div>
                  <div className="stat">
                    <div className="stat-v" style={{ color: totalPresent >= spotsOnField ? "var(--green)" : "var(--muted)" }}>
                      {Math.min(totalPresent, spotsOnField)}/{spotsOnField}
                    </div>
                    <div className="stat-l">Vagas titulares</div>
                  </div>
                  <div className="stat">
                    <div className="stat-v" style={{ color: Math.max(0, totalPresent - spotsOnField) > 0 ? "var(--yellow)" : "var(--muted)" }}>
                      {Math.max(0, totalPresent - spotsOnField)}
                    </div>
                    <div className="stat-l">Na fila</div>
                  </div>
                </div>

                <div className="btn-row">
                  <button className="btn btn-outline" onClick={markAll}>✅ Marcar Todos</button>
                  <button className="btn btn-ghost" onClick={() => { setPresence({}); setTeamsData(null); lsSave({ presence: {}, teamsData: null }); showToast("🔄 Resetado!"); }}>🔄 Resetar</button>
                </div>

                {/* Players */}
                <div className="card">
                  <div className="sbadge sb-or">🏃 Jogadores de Linha</div>
                  {(() => {
                    const presentArr = sortedPlayers;
                    const absentArr = parsed.players.filter(p => !presence[p.name]);
                    return [...presentArr, ...absentArr].map((p) => {
                      const on = !!presence[p.name];
                      const late = on && isLate(p.name);
                      const rank = presentArr.findIndex(x => x.name === p.name) + 1;
                      const lbl = on ? arrivalLabel(p.name, presentArr) : null;
                      const isTitular = on && !late && rank <= spotsOnField;
                      return (
                        <div key={p.name} className={`prow${on ? " on" : ""}`}>
                          <div className="dot" style={{
                            background: !on ? "var(--muted)" : late ? "var(--red)" : isTitular ? "var(--orange)" : "var(--yellow)",
                            boxShadow: on ? `0 0 8px ${late ? "var(--red)" : isTitular ? "var(--orange)" : "var(--yellow)"}` : "none"
                          }} />
                          <div className={`rank${isTitular ? " hot" : ""}`}>{on ? rank : "—"}</div>
                          <div className="pname">{cap(p.name)}</div>
                          {on && <div className="ptime">🕐 {fmtTime(presence[p.name])}</div>}
                          {lbl && <span className={`pos-badge ${lbl.cls}`}>{lbl.txt}</span>}
                          <button
                            className={`btn btn-sm ${on ? "btn-danger" : "btn-outline"}`}
                            onClick={() => toggle(p.name)}
                          >{on ? "✕" : "Chegou ✓"}</button>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Goalkeepers */}
                {parsed.goalkeepers.length > 0 && (
                  <div className="card">
                    <div className="sbadge sb-yw">🧤 Goleiros</div>
                    {(() => {
                      const presentGK = sortedGKs;
                      const absentGK = parsed.goalkeepers.filter(p => !presence[p.name]);
                      return [...presentGK, ...absentGK].map((p) => {
                        const on = !!presence[p.name];
                        const late = on && isLate(p.name);
                        const rank = presentGK.findIndex(x => x.name === p.name) + 1;
                        const isTitularGK = on && !late && rank <= numTeams;
                        return (
                          <div key={p.name} className={`prow${on ? " gkon" : ""}`}>
                            <div className="dot" style={{
                              background: !on ? "var(--muted)" : late ? "var(--red)" : isTitularGK ? "var(--yellow)" : "var(--muted)",
                              boxShadow: on && isTitularGK ? "0 0 8px var(--yellow)" : "none"
                            }} />
                            <div className={`rank${isTitularGK ? " hot" : ""}`}>{on ? rank : "—"}</div>
                            <div className="pname">🧤 {cap(p.name)}</div>
                            {on && <div className="ptime">🕐 {fmtTime(presence[p.name])}</div>}
                            {on && <span className={`pos-badge ${late ? "pos-late" : isTitularGK ? "pos-in" : "pos-queue"}`}>
                              {late ? "ATRASADO" : isTitularGK ? `${rank}° · TITULAR` : `${rank}° · RESERVA`}
                            </span>}
                            <button
                              className={`btn btn-sm ${on ? "btn-danger" : "btn-outline"}`}
                              style={on ? {} : { borderColor: "var(--yellow)", color: "var(--yellow)" }}
                              onClick={() => toggle(p.name)}
                            >{on ? "✕" : "Chegou ✓"}</button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* Absent from list */}
                {parsed.absent.length > 0 && (
                  <div className="card">
                    <div className="sbadge sb-re">❌ Ausentes Confirmados</div>
                    {parsed.absent.map((p, i) => (
                      <div key={i} className="prow absrow">
                        <div className="dot" style={{ background: "var(--red)" }} />
                        <div className="pname">{cap(p.name)}</div>
                        {p.emoji && <span style={{ fontSize: 18 }}>{p.emoji}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          )}

          {/* ══════ TAB: TIMES ══════ */}
          {tab === "teams" && (
            !parsed ? (
              <div className="empty"><div className="empty-ico">⚽</div>Processe uma lista primeiro!</div>
            ) : (
              <>
                {/* config */}
                <div className="card">
                  <div className="card-title">⚙️ Configuração dos Times</div>
                  <div className="info-note">
                    <b>Os primeiros {spotsOnField} a chegar jogam.</b> Dentro desse grupo, o sorteio é aleatório para definir em qual time cada um vai.
                    Goleiros não entram no sorteio — o 1° goleiro vai pro Time A, o 2° pro Time B, e assim por diante.
                  </div>
                  <div className="two-col">
                    <div>
                      <label>Nº de Times</label>
                      <select value={numTeams} onChange={e => setNumTeams(+e.target.value)}>
                        <option value={2}>2 Times</option>
                        <option value={3}>3 Times</option>
                        <option value={4}>4 Times</option>
                      </select>
                    </div>
                    <div>
                      <label>Jogadores por Time (sem goleiro)</label>
                      <input type="number" min={1} max={20} value={perTeam} onChange={e => setPerTeam(+e.target.value)} />
                    </div>
                  </div>

                  {kickoffStr && (
                    <div className="ko-bar" style={{ marginTop: 14 }}>
                      <span style={{ fontSize: 20 }}>⏱️</span>
                      <div>
                        <div className="ko-label">Kickoff</div>
                        <div className="ko-time">{kickoffStr}</div>
                      </div>
                      <div className={`ko-status ${isGameLive() ? "ko-live" : "ko-pre"}`}>
                        {isGameLive() ? "🔴 Em jogo" : "🟡 Pré-jogo"}
                      </div>
                    </div>
                  )}

                  <div className="btn-row">
                    <button className="btn btn-primary" onClick={genTeams}>🔀 Sortear Times</button>
                    {teamsData && (
                      <button className="btn btn-outline" onClick={genTeams}>🔁 Novo Sorteio</button>
                    )}
                  </div>
                </div>

                {/* RESULT */}
                {teamsData && (
                  <>
                    {/* Titulares */}
                    <div className="sbadge sb-or" style={{ marginBottom: 12 }}>⚽ Times Titulares — Sorteio Aleatório</div>
                    <div className="teams-grid">
                      {teamsData.teams.map((team, ti) => (
                        <div className="team-card" key={ti} style={{ borderColor: team.color + "28" }}>
                          <div className="team-head" style={{ background: team.bg, borderBottom: `1px solid ${team.color}30` }}>
                            <div className="team-sq" style={{ background: team.color }} />
                            <span style={{ color: team.color }}>{team.name}</span>
                            <span className="team-cnt">{team.players.length + (team.goalkeeper ? 1 : 0)}p</span>
                          </div>
                          <div className="team-body">
                            {team.goalkeeper ? (
                              <div className="team-gk">
                                <span>🧤</span>
                                <span>{cap(team.goalkeeper.name)}</span>
                                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)" }}>Goleiro</span>
                              </div>
                            ) : (
                              <div className="team-gk" style={{ color: "var(--muted)", opacity: .5 }}>
                                <span>🧤</span><span>Sem goleiro</span>
                              </div>
                            )}
                            {team.players.map((p, pi) => (
                              <div className="team-p" key={pi}>
                                {pi === 0 ? <span className="captain">★</span> : <span style={{ width: 16 }} />}
                                <span>{cap(p.name)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* On-time queue */}
                    {teamsData.queue.length > 0 && (
                      <div className="q-section">
                        <div className="q-header fifo">
                          <span>🟠</span> Fila de Entrada
                          <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: "auto", fontFamily: "Outfit", fontWeight: 400, letterSpacing: 0 }}>
                            {teamsData.queue.length} jogadores
                          </span>
                        </div>
                        <div className="q-body fifo">
                          {teamsData.queue.map((p, i) => (
                            <div className="q-row" key={i}>
                              <div className="q-n fifo-n">{i + 1}°</div>
                              <div style={{ flex: 1 }}>
                                <div>{cap(p.name)}</div>
                                <div className="q-sub">Chegou no horário · entra na próxima rodada</div>
                              </div>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>🕐 {fmtTime(presence[p.name])}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* On-time queue */}
                    {teamsData.nextOutPlayers.length > 0 && (
                      <div className="q-section">
                        <div className="q-header fifout">
                          <span>🔵</span> Fila de Saída
                          <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: "auto", fontFamily: "Outfit", fontWeight: 400, letterSpacing: 0 }}>
                            {teamsData.queue.length} jogadores
                          </span>
                        </div>
                        <div className="q-body fifout">
                          {teamsData.nextOutPlayers.map((p, i) => (
                            <div className="q-row" key={i}>
                              <div className="q-n fifout-n">{i + 1}°</div>
                              <div style={{ flex: 1 }}>
                                <div>{cap(p.name)}</div>
                                <div className="q-sub">Chegou no horário · sai na próxima rodada</div>
                              </div>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>🕐 {fmtTime(presence[p.name])}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Late queue */}
                    {teamsData.lateQueue && (teamsData.lateQueue.length > 0 || teamsData.gkQueue.some(g => isLate(g.name))) && (
                      <div className="q-section">
                        <div className="q-header late">
                          <span>🔴</span> Atrasados — Esperam o Jogo em Andamento
                          <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: "auto", fontFamily: "Outfit", fontWeight: 400, letterSpacing: 0 }}>
                            {teamsData.lateQueue.length} jogadores
                          </span>
                        </div>
                        <div className="q-body late">
                          {teamsData.lateQueue.map((p, i) => (
                            <div className="q-row" key={i}>
                              <div className="q-n late-n">{i + 1}°</div>
                              <div style={{ flex: 1 }}>
                                <div>{cap(p.name)}</div>
                                <div className="q-sub">Chegou após o kickoff · entra após a fila de entrada</div>
                              </div>
                              <div style={{ fontSize: 11, color: "var(--red)" }}>🕐 {fmtTime(presence[p.name])}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* GK bench */}
                    {teamsData.gkQueue.length > 0 && (
                      <div className="q-section">
                        <div className="q-header" style={{ background: "#ffd74010", border: "1px solid #ffd74028", borderBottom: "none", color: "var(--yellow)" }}>
                          <span>🧤</span> Goleiros Reserva
                        </div>
                        <div className="q-body" style={{ border: "1px solid #ffd74028", borderTop: "none" }}>
                          {teamsData.gkQueue.map((p, i) => (
                            <div className="q-row" key={i}>
                              <div className="q-n" style={{ color: "var(--yellow)" }}>{i + 1}°</div>
                              <div style={{ flex: 1 }}>
                                <div>🧤 {cap(p.name)}</div>
                                <div className="q-sub">{isLate(p.name) ? "Chegou após o kickoff" : "Aguardando vaga de goleiro"}</div>
                              </div>
                              <div style={{ fontSize: 11, color: isLate(p.name) ? "var(--red)" : "var(--muted)" }}>🕐 {fmtTime(presence[p.name])}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )
          )}
        </div>
      </div>
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  );
}
