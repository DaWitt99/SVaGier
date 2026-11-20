import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Eye, RotateCcw, Search, Shuffle } from "lucide-react";
import type { FlashcardEntry } from "../model";

interface FlashcardLibraryViewProps {
  entries: FlashcardEntry[];
  onOpenSource: (entry: FlashcardEntry) => void;
  onClose: () => void;
}

function entryKey(entry: FlashcardEntry): string {
  return `${entry.projectId}:${entry.drawingId}:${entry.nodeId}:${entry.card.id}`;
}

export default function FlashcardLibraryView({ entries, onOpenSource, onClose }: FlashcardLibraryViewProps) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [knownIds, setKnownIds] = useState<Set<string>>(() => new Set());
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(() => new Set());
  const [shuffleVersion, setShuffleVersion] = useState(0);
  const orderedEntries = useMemo(() => {
    const result = [...entries];
    if (shuffleVersion > 0) {
      let seed = shuffleVersion * 9301 + 49297;
      for (let index = result.length - 1; index > 0; index--) {
        seed = (seed * 9301 + 49297) % 233280;
        const target = Math.floor((seed / 233280) * (index + 1));
        [result[index], result[target]] = [result[target], result[index]];
      }
    }
    return result;
  }, [entries, shuffleVersion]);
  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return orderedEntries;
    return orderedEntries.filter((entry) => [entry.card.front, entry.card.back, entry.nodeTitle, entry.projectName, entry.drawingTitle]
      .some((value) => value.toLocaleLowerCase().includes(normalized)));
  }, [orderedEntries, query]);
  const current = filteredEntries.find((entry) => entryKey(entry) === activeId) ?? filteredEntries[0];
  const currentId = current ? entryKey(current) : null;
  const currentIndex = current ? filteredEntries.findIndex((entry) => entryKey(entry) === currentId) : -1;

  function selectEntry(entry: FlashcardEntry) {
    setActiveId(entryKey(entry));
    setFlipped(false);
  }

  function moveTo(offset: number) {
    if (filteredEntries.length === 0 || currentIndex < 0) return;
    const nextIndex = (currentIndex + offset + filteredEntries.length) % filteredEntries.length;
    selectEntry(filteredEntries[nextIndex]);
  }

  function mark(known: boolean) {
    if (!currentId) return;
    setReviewedIds((currentSet) => new Set(currentSet).add(currentId));
    if (known) setKnownIds((currentSet) => new Set(currentSet).add(currentId));
    else setKnownIds((currentSet) => { const next = new Set(currentSet); next.delete(currentId); return next; });
    moveTo(1);
  }

  return (
    <section className="flashcard-library-view" aria-label="Biblioteka fiszek">
      <header className="flashcard-library-header">
        <div className="flashcard-library-title">
          <span className="flashcard-library-mark"><BookOpen size={19} /></span>
          <div><span className="eyebrow">POWTÓRKI</span><h1>Biblioteka fiszek</h1></div>
        </div>
        <div className="flashcard-library-stats" aria-live="polite">
          <span>{entries.length} {entries.length === 1 ? "fiszka" : entries.length % 10 >= 2 && entries.length % 10 <= 4 && (entries.length % 100 < 12 || entries.length % 100 > 14) ? "fiszki" : "fiszek"}</span>
          <span>{knownIds.size} opanowanych</span>
        </div>
        <button className="flashcard-library-close" type="button" aria-label="Wróć do diagramu" onClick={onClose}><ArrowLeft size={15} /> Wróć do diagramu</button>
      </header>

      <div className="flashcard-library-toolbar">
        <label className="flashcard-search"><Search size={15} /><input aria-label="Szukaj fiszek" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Szukaj pytania, odpowiedzi lub elementu…" /></label>
        <button type="button" className="flashcard-shuffle" aria-label="Wymieszaj kolejność fiszek" disabled={filteredEntries.length < 2} onClick={() => { setShuffleVersion((version) => version + 1); setActiveId(null); setFlipped(false); }}><Shuffle size={14} /> Wymieszaj</button>
      </div>

      {entries.length === 0 ? (
        <div className="flashcard-library-empty">
          <span><BookOpen size={25} /></span>
          <h2>Biblioteka jest pusta</h2>
          <p>Wybierz element na diagramie, otwórz jego opcję „Fiszki” i dodaj pytanie z odpowiedzią.</p>
          <button type="button" onClick={onClose}>Wróć do diagramu</button>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="flashcard-library-empty compact"><h2>Brak pasujących fiszek</h2><p>Zmień wyszukiwaną frazę.</p></div>
      ) : (
        <div className="flashcard-library-content">
          <section className="flashcard-study" aria-label="Powtórka fiszek">
            <div className="flashcard-study-heading">
              <div><span className="eyebrow">TRYB NAUKI</span><h2>{current?.nodeTitle}</h2></div>
              <span className="flashcard-position">{currentIndex + 1} / {filteredEntries.length}</span>
            </div>
            {current && <div className={`flashcard-study-card${flipped ? " is-flipped" : ""}`}>
              <span className="flashcard-side-label">{flipped ? "ODPOWIEDŹ" : "PYTANIE"}</span>
              <p>{flipped ? current.card.back : current.card.front}</p>
              <button className="flashcard-source-link" type="button" onClick={() => onOpenSource(current)}>
                {current.projectName} · {current.drawingTitle}<span>Otwórz element na diagramie</span>
              </button>
            </div>}
            <div className="flashcard-study-controls">
              <button type="button" className="flashcard-step-button" aria-label="Poprzednia fiszka" title="Poprzednia fiszka" onClick={() => moveTo(-1)}><ArrowLeft size={16} /></button>
              {!flipped ? (
                <button type="button" className="flashcard-reveal-button" onClick={() => setFlipped(true)}><Eye size={16} /> Pokaż odpowiedź</button>
              ) : <>
                <button type="button" className="flashcard-repeat-button" onClick={() => mark(false)}><RotateCcw size={15} /> Powtórz</button>
                <button type="button" className="flashcard-known-button" onClick={() => mark(true)}><Check size={15} /> Znam</button>
              </>}
              <button type="button" className="flashcard-step-button" aria-label="Następna fiszka" title="Następna fiszka" onClick={() => moveTo(1)}><ArrowRight size={16} /></button>
            </div>
            <p className="flashcard-study-hint">Najpierw odpowiedz samodzielnie, potem odkryj tył fiszki.</p>
          </section>

          <aside className="flashcard-browse" aria-label="Wszystkie fiszki">
            <header><div><span className="eyebrow">ZAWARTOŚĆ</span><h2>Istniejące fiszki</h2></div><span>{filteredEntries.length}</span></header>
            <div className="flashcard-browse-list">
              {filteredEntries.map((entry, index) => {
                const id = entryKey(entry);
                return <button key={id} type="button" className={`flashcard-browse-item${id === currentId ? " active" : ""}`} aria-current={id === currentId ? "true" : undefined} onClick={() => selectEntry(entry)}>
                  <span className="flashcard-browse-item-number">{index + 1}</span>
                  <span className="flashcard-browse-item-copy"><strong>{entry.card.front}</strong><small>{entry.nodeTitle} · {entry.drawingTitle}</small></span>
                  {knownIds.has(id) && <Check size={14} className="flashcard-known-mark" title="Opanowana" />}
                  {reviewedIds.has(id) && !knownIds.has(id) && <RotateCcw size={13} className="flashcard-repeat-mark" title="Do powtórki" />}
                </button>;
              })}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
