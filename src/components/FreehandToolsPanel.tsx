import { ArrowUpRight, Eraser, Highlighter, Minus, PenLine, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { FreehandProfile, FreehandToolMode } from "../model";

interface FreehandToolsPanelProps {
  profiles: FreehandProfile[];
  activeProfileId: string;
  tool: FreehandToolMode;
  color: string;
  width: number;
  opacity: number;
  stabilization: number;
  palmRejection: boolean;
  recognizeShapes: boolean;
  snapToGrid: boolean;
  eraserSize: number;
  onSelectProfile: (id: string) => void;
  onSaveProfile: (name: string) => void;
  onDeleteProfile: (id: string) => void;
  onToolChange: (tool: FreehandToolMode) => void;
  onStyleChange: (style: { color?: string; width?: number; opacity?: number }) => void;
  onStabilizationChange: (value: number) => void;
  onPalmRejectionChange: (value: boolean) => void;
  onRecognizeShapesChange: (value: boolean) => void;
  onSnapToGridChange: (value: boolean) => void;
  onEraserSizeChange: (value: number) => void;
  onClose: () => void;
}

const tools: { id: FreehandToolMode; label: string; icon: typeof PenLine }[] = [
  { id: "pen", label: "Pióro", icon: PenLine },
  { id: "highlighter", label: "Zakreślacz", icon: Highlighter },
  { id: "line", label: "Linia", icon: Minus },
  { id: "arrow", label: "Strzałka", icon: ArrowUpRight },
  { id: "eraser-point", label: "Gumka punktowa", icon: Eraser },
  { id: "eraser-object", label: "Gumka obiektowa", icon: Trash2 },
];

export default function FreehandToolsPanel({
  profiles,
  activeProfileId,
  tool,
  color,
  width,
  opacity,
  stabilization,
  palmRejection,
  recognizeShapes,
  snapToGrid,
  eraserSize,
  onSelectProfile,
  onSaveProfile,
  onDeleteProfile,
  onToolChange,
  onStyleChange,
  onStabilizationChange,
  onPalmRejectionChange,
  onRecognizeShapesChange,
  onSnapToGridChange,
  onEraserSizeChange,
  onClose,
}: FreehandToolsPanelProps) {
  const [profileName, setProfileName] = useState("");
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId);
  const canDeleteProfile = Boolean(activeProfile && activeProfile.id.startsWith("custom-"));

  return (
    <section className="freehand-tools-panel" aria-label="Narzędzia rysowania odręcznego">
      <header className="freehand-tools-heading">
        <div><span className="eyebrow">RYSOWANIE</span><h2>Pióro i gumka</h2></div>
        <button className="icon-button" type="button" aria-label="Zakończ rysowanie" title="Zakończ rysowanie" onClick={onClose}><X size={16} /></button>
      </header>

      <div className="freehand-tool-grid" role="toolbar" aria-label="Wybierz narzędzie rysowania">
        {tools.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={tool === id ? "active" : ""} aria-label={label} title={label} aria-pressed={tool === id} onClick={() => onToolChange(id)}><Icon size={16} /><span>{label}</span></button>)}
      </div>

      <div className="freehand-panel-section">
        <label className="settings-field" htmlFor="freehand-profile"><span>Profil pióra</span>
          <select id="freehand-profile" value={activeProfileId} onChange={(event) => onSelectProfile(event.target.value)}>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
        <div className="freehand-profile-actions">
          <input aria-label="Nazwa zapisywanego profilu" value={profileName} maxLength={32} placeholder="Nazwa nowego profilu" onChange={(event) => setProfileName(event.target.value)} />
          <button type="button" aria-label="Zapisz profil pióra" title="Zapisz bieżący kolor, grubość i krycie" disabled={!profileName.trim()} onClick={() => { onSaveProfile(profileName.trim()); setProfileName(""); }}><Save size={14} /></button>
          {canDeleteProfile && <button type="button" aria-label={`Usuń profil ${activeProfile?.name}`} title="Usuń własny profil" onClick={() => onDeleteProfile(activeProfileId)}><Trash2 size={14} /></button>}
        </div>
      </div>

      <div className="freehand-style-row">
        <label className="field-group freehand-color"><span>Kolor</span><input type="color" value={color} onChange={(event) => onStyleChange({ color: event.target.value })} /></label>
        <label className="settings-field"><span>Grubość · {width}px</span><input type="range" min="1" max="28" step="0.5" value={width} onChange={(event) => onStyleChange({ width: Number(event.target.value) })} /></label>
      </div>
      <label className="settings-field"><span>Krycie · {Math.round(opacity * 100)}%</span><input type="range" min="0.15" max="1" step="0.05" value={opacity} onChange={(event) => onStyleChange({ opacity: Number(event.target.value) })} /></label>

      <div className="freehand-panel-section">
        <label className="settings-field"><span>Stabilizacja kreski · {stabilization}%</span><input type="range" min="0" max="100" step="5" value={stabilization} onChange={(event) => onStabilizationChange(Number(event.target.value))} /></label>
        <label className="settings-toggle"><input type="checkbox" checked={palmRejection} onChange={(event) => onPalmRejectionChange(event.target.checked)} /><span>Odrzucaj dotyk podczas rysowania</span></label>
        <label className="settings-toggle"><input type="checkbox" checked={recognizeShapes} onChange={(event) => onRecognizeShapesChange(event.target.checked)} /><span>Rozpoznawaj linie i kształty</span></label>
        <label className="settings-toggle"><input type="checkbox" checked={snapToGrid} onChange={(event) => onSnapToGridChange(event.target.checked)} /><span>Przyciągaj linie i kształty do siatki</span></label>
      </div>

      {(tool === "eraser-point" || tool === "eraser-object") && <label className="settings-field"><span>Rozmiar gumki · {eraserSize}px</span><input type="range" min="4" max="64" step="2" value={eraserSize} onChange={(event) => onEraserSizeChange(Number(event.target.value))} /></label>}
    </section>
  );
}
