import { BookmarkPlus, Crosshair, Maximize, Minus, Plus, Ruler, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { Camera, EditorSettings, Guide, GuideAxis, MeasurementUnit, SavedView } from "../model";
import { formatMeasurement, fromPixels, toPixels } from "../units";

interface CanvasSettingsPanelProps {
  settings: EditorSettings;
  camera: Camera;
  onChange: (updates: Partial<EditorSettings>) => void;
  onClose: () => void;
  onFit: () => void;
  onAddGuide: (axis: GuideAxis) => void;
  onRemoveGuide: (id: string) => void;
  onSaveView: (name: string) => void;
  onRestoreView: (camera: Camera) => void;
  onRemoveView: (id: string) => void;
}

const units: { value: MeasurementUnit; label: string }[] = [
  { value: "px", label: "px" },
  { value: "mm", label: "mm" },
  { value: "cm", label: "cm" },
  { value: "in", label: "in" },
];

function guideLabel(guide: Guide, unit: MeasurementUnit): string {
  return `${guide.axis === "vertical" ? "Pionowa" : "Pozioma"}, ${formatMeasurement(guide.position, unit)} ${unit}`;
}

export default function CanvasSettingsPanel({
  settings,
  camera,
  onChange,
  onClose,
  onFit,
  onAddGuide,
  onRemoveGuide,
  onSaveView,
  onRestoreView,
  onRemoveView,
}: CanvasSettingsPanelProps) {
  const [viewName, setViewName] = useState("");
  const spacing = fromPixels(settings.gridSpacingPx, settings.unit);

  function saveView() {
    onSaveView(viewName);
    setViewName("");
  }

  return (
    <section className="canvas-settings-panel" aria-label="Ustawienia płótna i widoku">
      <div className="canvas-settings-heading">
        <div>
          <span className="eyebrow">PŁÓTNO</span>
          <h2>Widok i nawigacja</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Zamknij ustawienia widoku" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="settings-section">
        <h3>Siatka i jednostki</h3>
        <div className="settings-fields-row">
          <label className="settings-field">
            <span>Typ siatki</span>
            <select value={settings.gridStyle} onChange={(event) => onChange({ gridStyle: event.target.value as EditorSettings["gridStyle"] })}>
              <option value="dots">Punktowa</option>
              <option value="lines">Liniowa</option>
              <option value="isometric">Izometryczna</option>
            </select>
          </label>
          <label className="settings-field settings-field-small">
            <span>Jednostki</span>
            <select
              value={settings.unit}
              onChange={(event) => onChange({ unit: event.target.value as MeasurementUnit })}
            >
              {units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
            </select>
          </label>
        </div>
        <label className="settings-field">
          <span>Odstęp siatki ({settings.unit})</span>
          <input
            type="number"
            min="0.1"
            step={settings.unit === "px" ? "1" : "0.1"}
            value={Number(spacing.toFixed(2))}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value > 0) onChange({ gridSpacingPx: Math.max(1, Math.min(500, toPixels(value, settings.unit))) });
            }}
          />
        </label>
        <label className="settings-toggle">
          <input type="checkbox" checked={settings.snapToGrid} onChange={(event) => onChange({ snapToGrid: event.target.checked })} />
          <span>Przyciągaj elementy do siatki</span>
        </label>
        <label className="settings-toggle">
          <input type="checkbox" checked={settings.showRulers} onChange={(event) => onChange({ showRulers: event.target.checked })} />
          <span>Pokazuj linijki</span>
        </label>
        <label className="settings-toggle">
          <input type="checkbox" checked={settings.showMinimap} onChange={(event) => onChange({ showMinimap: event.target.checked })} />
          <span>Pokazuj miniaturę płótna</span>
        </label>
      </div>

      <div className="settings-section">
        <div className="settings-section-heading">
          <h3>Prowadnice</h3>
          <div className="settings-inline-actions">
            <button type="button" className="settings-icon-action" title="Dodaj prowadnicę pionową" aria-label="Dodaj prowadnicę pionową" onClick={() => onAddGuide("vertical")}><Plus size={15} /></button>
            <button type="button" className="settings-icon-action" title="Dodaj prowadnicę poziomą" aria-label="Dodaj prowadnicę poziomą" onClick={() => onAddGuide("horizontal")}><Minus size={15} /></button>
          </div>
        </div>
        <p className="settings-hint">Przeciągnij prowadnicę z linijki albo dodaj ją przy środku widoku.</p>
        {settings.guides.length ? (
          <ul className="settings-item-list">
            {settings.guides.map((guide) => (
              <li key={guide.id}>
                <span><Crosshair size={13} />{guideLabel(guide, settings.unit)}</span>
                <button type="button" aria-label={`Usuń prowadnicę ${guideLabel(guide, settings.unit)}`} onClick={() => onRemoveGuide(guide.id)}><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        ) : <p className="settings-empty">Brak prowadnic</p>}
      </div>

      <div className="settings-section">
        <div className="settings-section-heading">
          <h3>Zapisane widoki</h3>
          <button type="button" className="settings-fit-button" onClick={onFit}><Maximize size={14} /> Dopasuj diagram</button>
        </div>
        <div className="settings-view-input">
          <input
            aria-label="Nazwa zapisywanego widoku"
            placeholder={`Widok ${settings.savedViews.length + 1}`}
            value={viewName}
            onChange={(event) => setViewName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") saveView(); }}
          />
          <button type="button" aria-label="Zapisz bieżący widok" title={`Zapisz widok przy powiększeniu ${Math.round(camera.zoom * 100)}%`} onClick={saveView}>
            <BookmarkPlus size={15} />
          </button>
        </div>
        {settings.savedViews.length ? (
          <ul className="settings-item-list saved-view-list">
            {settings.savedViews.map((view: SavedView) => (
              <li key={view.id}>
                <button className="saved-view-restore" type="button" onClick={() => onRestoreView(view.camera)}>
                  <Ruler size={13} />
                  <span>{view.name}</span>
                  <small>{Math.round(view.camera.zoom * 100)}%</small>
                </button>
                <button type="button" aria-label={`Usuń widok ${view.name}`} onClick={() => onRemoveView(view.id)}><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        ) : <p className="settings-empty">Zapisz widok, aby szybko do niego wrócić.</p>}
      </div>
    </section>
  );
}
