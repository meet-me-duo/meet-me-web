import { useEffect, useMemo, useState } from "react";
import type { ManualAvailability, Room } from "../api/types";
import { availabilityToSelection, roomRows, selectionKey, selectionToAvailability, SLOT_COUNT, slotLabel } from "../utils/time";

interface Props {
  room: Room;
  value: ManualAvailability[];
  onChange: (value: ManualAvailability[]) => void;
  disabled?: boolean;
}

export function TimeGrid({ room, value, onChange, disabled = false }: Props) {
  const rows = useMemo(() => roomRows(room), [room]);
  const [selected, setSelected] = useState(() => availabilityToSelection(rows, value));
  const [paintValue, setPaintValue] = useState<boolean | null>(null);

  useEffect(() => setSelected(availabilityToSelection(rows, value)), [rows, value]);
  useEffect(() => {
    const stop = () => setPaintValue(null);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const update = (key: string, nextValue: boolean) => {
    if (disabled) return;
    setSelected((current) => {
      const next = new Set(current);
      if (nextValue) next.add(key); else next.delete(key);
      onChange(selectionToAvailability(rows, next));
      return next;
    });
  };

  const clear = () => {
    setSelected(new Set());
    onChange([]);
  };

  return (
    <section className="time-grid-section" aria-labelledby="availability-title">
      <div className="section-heading inline-heading">
        <div><h3 id="availability-title">가능한 시간</h3><p>가능한 칸을 눌러 선택하세요. 가로로 밀어서 더 볼 수 있어요.</p></div>
        {selected.size > 0 && <button type="button" className="text-button" onClick={clear} disabled={disabled}>전체 해제</button>}
      </div>
      <div className="grid-scroll">
        <div className="time-grid" role="grid" aria-label="가능 시간 선택표" style={{ gridTemplateColumns: `7.5rem repeat(${SLOT_COUNT}, 2rem)` }}>
          <div className="grid-corner" />
          {Array.from({ length: SLOT_COUNT }, (_, slot) => (
            <div className={`time-label ${slot % 2 ? "minor" : ""}`} key={slot}>{slot % 2 === 0 ? slotLabel(slot) : ""}</div>
          ))}
          {rows.map((row) => (
            <div className="grid-row-fragment" key={row.key} role="row">
              <div className="row-label" role="rowheader">{row.label}</div>
              {Array.from({ length: SLOT_COUNT }, (_, slot) => {
                const key = selectionKey(row.key, slot);
                const active = selected.has(key);
                return (
                  <button
                    type="button"
                    key={key}
                    className={`time-cell ${active ? "selected" : ""}`}
                    aria-label={`${row.label} ${slotLabel(slot)}부터 30분 ${active ? "선택됨" : "선택 안 됨"}`}
                    aria-pressed={active}
                    disabled={disabled}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      const next = !active;
                      setPaintValue(next);
                      update(key, next);
                    }}
                    onPointerEnter={(event) => {
                      if (event.buttons === 1 && paintValue !== null) update(key, paintValue);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === " " || event.key === "Enter") {
                        event.preventDefault();
                        update(key, !active);
                      }
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="field-hint">30분 단위 · 자정을 넘는 구간은 날짜별로 나누어 선택해 주세요.</p>
    </section>
  );
}
