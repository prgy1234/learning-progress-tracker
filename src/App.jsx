import { useEffect, useMemo, useState } from "react";

const API = "/api/v1";
const statuses = ["Not Started", "In Progress", "Completed"];

async function csrf() {
  const response = await fetch(`${API}/auth/csrf`, { credentials: "include" });
  if (!response.ok) throw new Error("Could not start a secure session. Refresh and try again.");
  return (await response.json()).csrfToken;
}
async function request(path, options = {}) {
  const method = options.method || "GET";
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers["X-CSRF-Token"] = await csrf();
  const response = await fetch(`${API}${path}`, {
    credentials: "include", ...options, headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed. Please try again.");
  return data;
}

function Brand() {
  return <div className="brand"><span className="brand-mark">n.</span><span>northstar<span className="brand-light"> learning</span></span></div>;
}
function Notice({ notice, onClose }) {
  if (!notice) return null;
  return <div className={`notice ${notice.type || "success"}`} role="status">{notice.message}<button onClick={onClose} aria-label="Dismiss">×</button></div>;
}
function Spinner() { return <div className="spinner-wrap"><span className="spinner" /> Loading your workspace…</div>; }

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("Dashboard");
  const [notice, setNotice] = useState(null);
  const [mustChange, setMustChange] = useState(false);

  const notify = (message, type = "success") => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 5000);
  };

  useEffect(() => {
    request("/auth/me").then(({ user: current }) => {
      setUser(current);
      setMustChange(current.mustChangePassword);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function signIn(email, password) {
    const result = await request("/auth/login", { method: "POST", body: { email, password } });
    setUser(result.user);
    setMustChange(result.user.mustChangePassword);
    setPage("Dashboard");
  }
  async function signOut() {
    try { await request("/auth/logout", { method: "POST" }); }
    finally { setUser(null); setMustChange(false); setPage("Dashboard"); }
  }
  async function changePassword(currentPassword, newPassword) {
    await request("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
    const { user: refreshed } = await request("/auth/me");
    setUser(refreshed);
    setMustChange(false);
    notify("Password updated. Welcome to your learning space.");
  }

  if (loading) return <div className="app-loading"><Brand /><Spinner /></div>;
  if (!user) return <><Login onSignIn={signIn} /><Notice notice={notice} onClose={() => setNotice(null)} /></>;
  if (mustChange) return <><ChangePassword onSubmit={changePassword} onLogout={signOut} /><Notice notice={notice} onClose={() => setNotice(null)} /></>;

  return user.role === "Coordinator"
    ? <Coordinator user={user} page={page} setPage={setPage} signOut={signOut} notify={notify} />
    : <Candidate user={user} signOut={signOut} notify={notify} />;
}

function Login({ onSignIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try { await onSignIn(email, password); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell">
    <section className="auth-art">
      <Brand />
      <div className="art-copy"><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
        <h1>Progress looks good on you.</h1>
        <p>A calmer way to learn, grow, and see how far you’ve come.</p>
      </div>
      <div className="art-foot"><span>01 / LEARN</span><span>02 / PRACTICE</span><span>03 / GROW</span></div>
      <div className="orb orb-one" /><div className="orb orb-two" />
    </section>
    <section className="auth-panel">
      <div className="auth-form-wrap">
        <span className="eyebrow dark-eyebrow">WELCOME BACK</span>
        <h2>Sign in to your space</h2><p className="muted">Pick up where your learning journey left off.</p>
        <form onSubmit={submit} className="form-stack">
          <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"} <span>↗</span></button>
        </form>
        <div className="secure-note"><span>✳</span> Secure access for coordinators and candidates</div>
      </div>
      <footer className="auth-footer">NORTHSTAR LEARNING <span>© 2026</span></footer>
    </section>
  </main>;
}

function ChangePassword({ onSubmit, onLogout }) {
  const [current, setCurrent] = useState(""); const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setError("");
    if (next !== confirm) return setError("Your new passwords do not match.");
    setBusy(true);
    try { await onSubmit(current, next); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="password-page">
    <div className="password-card"><Brand /><div className="lock-icon">✳</div>
      <span className="eyebrow dark-eyebrow">ONE QUICK STEP</span><h1>Create your password</h1>
      <p className="muted">For your security, replace the temporary password before opening your training.</p>
      <form onSubmit={submit} className="form-stack">
        <label>Temporary password<input type="password" value={current} onChange={e => setCurrent(e.target.value)} required /></label>
        <label>New password<input type="password" value={next} onChange={e => setNext(e.target.value)} minLength="10" required /></label>
        <label>Confirm new password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></label>
        <small className="muted">At least 10 characters, including uppercase, lowercase, and a number.</small>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-full" disabled={busy}>{busy ? "Saving…" : "Save password"} ↗</button>
      </form>
      <button className="text-button" onClick={onLogout}>Sign out</button>
    </div>
  </main>;
}

function Shell({ user, active, setActive, signOut, children, candidate = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = candidate ? ["My Training"] : ["Dashboard", "Activities", "Candidates"];
  return <div className="layout">
    <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
      <Brand />
      <div className="side-label">WORKSPACE</div>
      <nav>{nav.map((item, i) => <button key={item} className={`nav-item ${active === item ? "active" : ""}`} onClick={() => { setActive(item); setMenuOpen(false); }}>
        <span className="nav-icon">{["◫", "▤", "◎"][i]}</span>{item}{active === item && <span className="nav-dot" />}
      </button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-spark">✳</span><b>Keep your momentum</b><p>Small steps add up to big progress.</p></div>
        <div className="profile-row"><div className="avatar">{(user.learner?.display_name || user.email).slice(0,1).toUpperCase()}</div><div className="profile-text"><b>{user.learner?.display_name || "Coordinator"}</b><span>{user.role}</span></div><button className="icon-button" onClick={signOut} title="Sign out" aria-label="Sign out">↗</button></div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle navigation">☰</button><div className="crumb">Workspace <span>/</span> {active}</div><div className="topbar-right"><span className="live-dot" /> Learning hub <div className="top-avatar">{(user.learner?.display_name || user.email).slice(0,1).toUpperCase()}</div></div></header>
      <div className="page-content">{children}</div>
    </main>
  </div>;
}

function Coordinator({ user, page, setPage, signOut, notify }) {
  return <Shell user={user} active={page} setActive={setPage} signOut={signOut}>
    {page === "Dashboard" ? <Dashboard notify={notify} setPage={setPage} /> : page === "Activities" ? <Activities notify={notify} /> : <Candidates notify={notify} />}
  </Shell>;
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><span className="eyebrow dark-eyebrow">{eyebrow}</span><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>;
}

function Dashboard({ notify, setPage }) {
  const [summary, setSummary] = useState(null); const [activities, setActivities] = useState([]);
  const [learners, setLearners] = useState([]); const [selected, setSelected] = useState("");
  const [assignments, setAssignments] = useState([]); const [activityId, setActivityId] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const [s, a, l] = await Promise.all([request("/cohort-summary"), request("/activities"), request("/learners")]);
      setSummary(s); setActivities(a); setLearners(l);
      if (!selected && l.length) setSelected(String(l[0].id));
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (selected) request(`/learners/${selected}/assignments`).then(setAssignments).catch(err => setError(err.message));
    else setAssignments([]);
  }, [selected]);
  async function assign(e) {
    e.preventDefault(); if (!selected || !activityId) return;
    setBusy(true);
    try {
      await request("/assignments", { method: "POST", body: { learnerId: Number(selected), activityId: Number(activityId) } });
      notify("Training assigned successfully."); setActivityId(""); await load();
      setAssignments(await request(`/learners/${selected}/assignments`));
    } catch (err) { notify(err.message, "error"); }
    finally { setBusy(false); }
  }
  if (!summary && !error) return <Spinner />;
  return <>
    <PageHeading eyebrow="COORDINATOR OVERVIEW" title="Good things are in progress." description="Here’s the latest picture of your learning cohort." action={<button className="btn btn-primary" onClick={() => setPage("Activities")}>＋ New activity</button>} />
    {error && <div className="inline-error">{error} <button onClick={load}>Retry</button></div>}
    <div className="summary-grid">
      <StatCard label="Total candidates" value={summary?.learners ?? "—"} detail="Across your cohorts" icon="◎" />
      <StatCard label="Training assignments" value={summary?.assignments ?? "—"} detail="Learning paths created" icon="▤" />
      <StatCard label="Completed activities" value={summary?.completed ?? "—"} detail="Milestones achieved" icon="✳" />
      <div className="stat-card progress-stat"><div className="stat-top"><span>COHORT COMPLETION</span><span className="stat-icon">↗</span></div><div className="stat-value">{summary?.assignments ? Math.round(summary.completed / summary.assignments * 100) : 0}%</div><div className="progress-track"><span style={{width: `${summary?.assignments ? summary.completed / summary.assignments * 100 : 0}%`}} /></div><p>Completed assignments</p></div>
    </div>
    <div className="content-grid">
      <section className="panel assignments-panel"><div className="panel-heading"><div><span className="eyebrow dark-eyebrow">LEARNER SNAPSHOT</span><h2>Training by candidate</h2></div><span className="soft-tag">{learners.length} candidates</span></div>
        <div className="select-row"><label htmlFor="learner-select">Choose a candidate</label><select id="learner-select" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Select candidate</option>{learners.map(l => <option key={l.id} value={l.id}>{l.display_name}</option>)}</select></div>
        {selected && <form className="assign-form" onSubmit={assign}><select aria-label="Activity to assign" value={activityId} onChange={e => setActivityId(e.target.value)} required><option value="">Choose activity to assign</option>{activities.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select><button className="btn btn-dark" disabled={busy || !activityId}>{busy ? "Adding…" : "Assign"}</button></form>}
        {!learners.length ? <EmptyState title="No candidates yet" text="Add your first candidate to start tracking progress." action={() => setPage("Candidates")} actionText="Add candidate" /> :
          !assignments.length ? <EmptyState title="A fresh start" text="No training assigned to this candidate yet." /> :
          <div className="assignment-list">{assignments.map(a => <div className="assignment-row" key={a.id}><div className="activity-symbol">↗</div><div className="assignment-info"><b>{a.title}</b><span>{a.topic} · {a.planned_hours} hours</span></div><StatusPill status={a.status} /></div>)}</div>}
      </section>
      <section className="panel activity-panel"><div className="panel-heading"><div><span className="eyebrow dark-eyebrow">LEARNING LIBRARY</span><h2>Activities</h2></div><button className="link-button" onClick={() => setPage("Activities")}>View all ↗</button></div>
        {activities.slice(0,4).map((a,i) => <div className="library-row" key={a.id}><div className={`library-number n${i}`}>0{i+1}</div><div><b>{a.title}</b><span>{a.topic}</span></div><small>{a.planned_hours}h</small></div>)}
        {!activities.length && <EmptyState title="No activities yet" text="Create an activity to build your learning library." />}
      </section>
    </div>
  </>;
}

function StatCard({ label, value, detail, icon }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value}</div><p>{detail}</p></div>;
}
function EmptyState({ title, text, action, actionText }) {
  return <div className="empty-state"><span>✳</span><b>{title}</b><p>{text}</p>{action && <button className="link-button" onClick={action}>{actionText} ↗</button>}</div>;
}
function StatusPill({ status }) {
  return <span className={`status-pill ${status.toLowerCase().replaceAll(" ", "-")}`}><i />{status}</span>;
}

function Activities({ notify }) {
  const [items, setItems] = useState([]); const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ title: "", topic: "", plannedHours: "" }); const [busy, setBusy] = useState(false);
  async function load() { try { setItems(await request("/activities")); } catch (e) { notify(e.message, "error"); } }
  useEffect(() => { load(); }, []);
  function open(item) { setModal(item || {}); setForm(item ? { title: item.title, topic: item.topic, plannedHours: item.planned_hours } : { title: "", topic: "", plannedHours: "" }); }
  async function save(e) {
    e.preventDefault(); setBusy(true);
    try {
      const editing = Boolean(modal?.id);
      await request(editing ? `/activities/${modal.id}` : "/activities", { method: editing ? "PUT" : "POST", body: { ...form, plannedHours: Number(form.plannedHours) } });
      setModal(null); notify(editing ? "Activity updated." : "Activity created."); await load();
    } catch (err) { notify(err.message, "error"); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading eyebrow="BUILD YOUR LIBRARY" title="Learning activities" description="Create clear, useful steps for every learning journey." action={<button className="btn btn-primary" onClick={() => open(null)}>＋ Add activity</button>} />
    <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow dark-eyebrow">YOUR CONTENT</span><h2>Activity library</h2></div><span className="soft-tag">{items.length} activities</span></div>
      {items.length ? <div className="table-scroll"><table><thead><tr><th>ACTIVITY</th><th>TOPIC</th><th>PLANNED TIME</th><th></th></tr></thead><tbody>{items.map((a,i) => <tr key={a.id}><td><div className="table-title"><span className={`table-index t${i%4}`}>0{(i%4)+1}</span><b>{a.title}</b></div></td><td><span className="topic-tag">{a.topic}</span></td><td>{a.planned_hours} hours</td><td><button className="edit-button" onClick={() => open(a)}>Edit ↗</button></td></tr>)}</tbody></table></div> : <EmptyState title="Your library is ready for ideas" text="Add your first learning activity to get started." action={() => open(null)} actionText="Add activity" />}
    </section>
    {modal !== null && <Modal title={modal.id ? "Edit activity" : "Create an activity"} onClose={() => setModal(null)}><form onSubmit={save} className="form-stack">
      <label>Activity title<input value={form.title} onChange={e => setForm({...form,title:e.target.value})} placeholder="e.g. React Fundamentals" required minLength="2" maxLength="100" /></label>
      <label>Topic<input value={form.topic} onChange={e => setForm({...form,topic:e.target.value})} placeholder="e.g. Frontend" required minLength="2" maxLength="60" /></label>
      <label>Planned hours<input type="number" min="0.5" step="0.5" value={form.plannedHours} onChange={e => setForm({...form,plannedHours:e.target.value})} placeholder="e.g. 6" required /></label>
      <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save activity"}</button></div>
    </form></Modal>}
  </>;
}

function Candidates({ notify }) {
  const [items, setItems] = useState([]); const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", cohort: "Frontend Cohort" });
  const [credential, setCredential] = useState(null); const [busy, setBusy] = useState(false);
  async function load() { try { setItems(await request("/learners")); } catch (e) { notify(e.message, "error"); } }
  useEffect(() => { load(); }, []);
  async function create(e) {
    e.preventDefault(); setBusy(true);
    try { const result = await request("/learners", { method: "POST", body: form }); setCredential(result); setModal(false); setForm({name:"",email:"",cohort:"Frontend Cohort"}); await load(); notify("Candidate account created."); }
    catch (err) { notify(err.message, "error"); }
    finally { setBusy(false); }
  }
  async function reset(id) {
    if (!window.confirm("Generate a new temporary password? The previous password and active sessions will be invalidated.")) return;
    try { setCredential(await request(`/learners/${id}/reset-password`, { method: "POST" })); notify("Temporary password reset. Share it privately."); }
    catch (err) { notify(err.message, "error"); }
  }
  return <>
    <PageHeading eyebrow="YOUR PEOPLE" title="Candidates" description="Create accounts and keep every learner moving forward." action={<button className="btn btn-primary" onClick={() => setModal(true)}>＋ Add candidate</button>} />
    <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow dark-eyebrow">COHORT DIRECTORY</span><h2>All candidates</h2></div><span className="soft-tag">{items.length} people</span></div>
      {items.length ? <div className="table-scroll"><table><thead><tr><th>NAME</th><th>EMAIL / LOGIN</th><th>COHORT</th><th>ACTION</th></tr></thead><tbody>{items.map(l => <tr key={l.id}><td><div className="person-cell"><span className="avatar">{l.display_name.slice(0,1)}</span><b>{l.display_name}</b></div></td><td>{l.email}</td><td><span className="topic-tag">{l.cohort}</span></td><td><button className="edit-button" onClick={() => reset(l.id)}>Reset password ↗</button></td></tr>)}</tbody></table></div> : <EmptyState title="Meet your first learner" text="Create a candidate account to begin building your cohort." action={() => setModal(true)} actionText="Add candidate" />}
    </section>
    {modal && <Modal title="Add a candidate" onClose={() => setModal(false)}><form className="form-stack" onSubmit={create}>
      <label>Full name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Taylor Morgan" required /></label>
      <label>Email address<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="name@example.com" required /></label>
      <label>Cohort<input value={form.cohort} onChange={e=>setForm({...form,cohort:e.target.value})} required /></label>
      <p className="helper-note">A random temporary password will be generated. It expires after 24 hours and is shown once.</p>
      <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={()=>setModal(false)}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy?"Creating…":"Create account"}</button></div>
    </form></Modal>}
    {credential && <Modal title="One-time login details" onClose={()=>setCredential(null)}><div className="credential-warning">✳ Share these details privately. The temporary password will not be shown again.</div><div className="credential-box"><span>USERNAME</span><b>{credential.username}</b><span>TEMPORARY PASSWORD</span><b className="credential-password">{credential.temporaryPassword}</b><span>EXPIRES</span><b>{new Date(credential.expiresAt).toLocaleString()}</b></div><button className="btn btn-primary btn-full" onClick={()=>{navigator.clipboard?.writeText(`Username: ${credential.username}\nTemporary password: ${credential.temporaryPassword}`);notify("Credentials copied.");}}>Copy credentials</button></Modal>}
  </>;
}

function Modal({ title, onClose, children }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div>{children}</section></div>;
}

function Candidate({ user, signOut, notify }) {
  const [items, setItems] = useState([]); const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    try { setItems(await request("/me/assignments")); }
    catch (err) { notify(err.message, "error"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function update(id, status) {
    try { await request(`/assignments/${id}/status`, { method: "PATCH", body: { status } }); setItems(old => old.map(a => a.id === id ? {...a,status} : a)); notify("Your progress has been saved."); }
    catch (err) { notify(err.message, "error"); }
  }
  const completed = items.filter(a => a.status === "Completed").length;
  return <Shell user={user} active="My Training" setActive={()=>{}} signOut={signOut} candidate>
    <PageHeading eyebrow={user.learner?.cohort || "YOUR LEARNING SPACE"} title={`Hello, ${user.learner?.display_name?.split(" ")[0] || "there"}.`} description="Your next step is waiting. Keep your momentum going." />
    <div className="learner-banner"><div><span className="eyebrow">YOUR JOURNEY, YOUR PACE</span><h2>Every step counts.</h2><p>You’ve completed {completed} of {items.length} assigned activities.</p></div><div className="journey-ring"><b>{items.length ? Math.round(completed/items.length*100) : 0}%</b><span>complete</span></div></div>
    <div className="section-title-row"><div><span className="eyebrow dark-eyebrow">YOUR PLAN</span><h2>My training</h2></div><span className="soft-tag">{items.length} activities</span></div>
    {loading ? <Spinner /> : items.length ? <div className="training-grid">{items.map((a,i)=><article className="training-card" key={a.id}><div className="training-card-top"><span className={`library-number n${i%4}`}>0{(i%4)+1}</span><StatusPill status={a.status} /></div><h3>{a.title}</h3><p>{a.topic} <span>·</span> {a.planned_hours} planned hours</p><label className="status-select-label" htmlFor={`status-${a.id}`}>Update your progress</label><select id={`status-${a.id}`} value={a.status} onChange={e=>update(a.id,e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></article>)}</div> : <div className="panel"><EmptyState title="No training assigned yet" text="Your coordinator hasn’t assigned any activities. Check back soon." /></div>}
  </Shell>;
}
