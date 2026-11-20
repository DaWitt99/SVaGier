import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, File, FilePlus2, Folder, FolderOpen, FolderPlus, PencilLine, Trash2, X } from "lucide-react";
import type { DiagramProject } from "../model";

interface ProjectExplorerPanelProps {
  projects: DiagramProject[];
  activeProjectId: string;
  activeDrawingId: string;
  onOpenProject: (projectId: string) => void;
  onOpenDrawing: (projectId: string, drawingId: string) => void;
  onCreateProject: () => void;
  onCreateDrawing: (projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onDeleteDrawing: (projectId: string, drawingId: string) => void;
  onClose: () => void;
}

export default function ProjectExplorerPanel({
  projects,
  activeProjectId,
  activeDrawingId,
  onOpenProject,
  onOpenDrawing,
  onCreateProject,
  onCreateDrawing,
  onRenameProject,
  onDeleteProject,
  onDeleteDrawing,
  onClose,
}: ProjectExplorerPanelProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set([activeProjectId]));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setExpandedProjects((current) => new Set([...current, activeProjectId]));
  }, [activeProjectId]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  function toggleProject(projectId: string) {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
    onOpenProject(projectId);
  }

  return (
    <div className="project-explorer-layer">
      <button className="project-explorer-scrim" type="button" aria-label="Zamknij eksplorator projektów" onClick={onClose} />
      <aside className="project-explorer" aria-label="Eksplorator projektów i rysunków">
        <header className="project-explorer-header">
          <div className="project-explorer-heading">
            <FolderOpen size={17} />
            <div><span className="eyebrow">PRZESTRZEŃ ROBOCZA</span><h2>Projekty</h2></div>
          </div>
          <div className="project-explorer-header-actions">
            <button type="button" aria-label="Nowy projekt" title="Nowy projekt" onClick={onCreateProject}><FolderPlus size={15} /></button>
            <button type="button" aria-label="Zamknij eksplorator" title="Zamknij" onClick={onClose}><X size={16} /></button>
          </div>
        </header>
        <div className="project-explorer-list" aria-label="Lista projektów i rysunków">
          {projects.map((project) => {
            const expanded = expandedProjects.has(project.id);
            const activeProject = project.id === activeProjectId;
            return <section className={`project-explorer-project${activeProject ? " is-current" : ""}`} key={project.id}>
              <div className="project-explorer-project-row">
                <button
                  className="project-explorer-folder"
                  type="button"
                  aria-expanded={expanded}
                  aria-current={activeProject ? "true" : undefined}
                  title={project.name}
                  onClick={() => toggleProject(project.id)}
                >
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  {expanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                  <span>{project.name}</span>
                </button>
                <div className="project-explorer-actions">
                  <button type="button" aria-label={`Nowy rysunek w projekcie ${project.name}`} title="Nowy rysunek" onClick={() => onCreateDrawing(project.id)}><FilePlus2 size={14} /></button>
                  <button type="button" aria-label={`Zmień nazwę projektu ${project.name}`} title="Zmień nazwę projektu" onClick={() => onRenameProject(project.id)}><PencilLine size={13} /></button>
                  <button type="button" aria-label={`Usuń projekt ${project.name}`} title="Usuń projekt" disabled={projects.length <= 1} onClick={() => onDeleteProject(project.id)}><Trash2 size={13} /></button>
                </div>
              </div>
              {expanded && <div className="project-explorer-drawings">
                {project.drawings.map((drawing) => {
                  const activeDrawing = activeProject && drawing.id === activeDrawingId;
                  return <div className={`project-explorer-drawing-row${activeDrawing ? " is-current" : ""}`} key={drawing.id}>
                    <button
                      className="project-explorer-file"
                      type="button"
                      aria-current={activeDrawing ? "page" : undefined}
                      title={drawing.document.title}
                      onClick={() => onOpenDrawing(project.id, drawing.id)}
                    >
                      <File size={14} />
                      <span>{drawing.document.title || "Bez nazwy"}</span>
                    </button>
                    <button
                      className="project-explorer-delete-file"
                      type="button"
                      aria-label={`Usuń rysunek ${drawing.document.title}`}
                      title="Usuń rysunek"
                      disabled={project.drawings.length <= 1}
                      onClick={() => onDeleteDrawing(project.id, drawing.id)}
                    ><Trash2 size={13} /></button>
                  </div>;
                })}
              </div>}
            </section>;
          })}
        </div>
        <footer className="project-explorer-footer">Rysunki są zapisywane lokalnie na tym urządzeniu.</footer>
      </aside>
    </div>
  );
}
