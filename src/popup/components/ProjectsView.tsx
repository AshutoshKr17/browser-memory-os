import { useEffect, useState } from 'react';
import { sendMessage } from '../../shared/messaging';
import type { Project } from '../../shared/types';

export function ProjectsView() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    sendMessage<Project[]>({ type: 'LIST_PROJECTS' }).then(setProjects).catch(() => setProjects([]));

  useEffect(() => {
    load();
  }, []);

  async function recluster() {
    setBusy(true);
    try {
      const p = await sendMessage<Project[]>({ type: 'RECLUSTER' });
      setProjects(p);
    } finally {
      setBusy(false);
    }
  }

  if (projects === null) return <div className="empty"><span className="spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px' }}>
        <div className="section-label" style={{ padding: 0 }}>
          Detected Projects
        </div>
        <button className="primary-btn" style={{ padding: '5px 10px', fontSize: 12 }} onClick={recluster} disabled={busy}>
          {busy ? 'Clustering…' : 'Re-cluster'}
        </button>
      </div>
      {projects.length === 0 ? (
        <div className="empty">
          <div className="big">🧩</div>
          No projects yet. Browse a few related pages and I&apos;ll group them into
          working sets automatically.
        </div>
      ) : (
        projects.map((p) => (
          <div className="project-card" key={p.id}>
            <h4>{p.name}</h4>
            <div className="domains">
              {p.memoryIds.length} pages · {p.domains.length} domains
            </div>
            <div>
              {p.domains.slice(0, 6).map((d) => (
                <span className="chip" key={d}>
                  {d}
                </span>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
