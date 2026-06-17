import { INPUT_CLS } from './eval-helpers';

// Standalone 0–10 score input. Previously defined INSIDE EvalModal, which made
// React treat it as a new component type on every parent render and remount the
// <input> — so the field lost focus after each keystroke (BUG-fix). As a stable
// module-level component it keeps focus while typing. Controlled via props.
export default function ScoreInput({ id, label, value, onChange }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs text-muted-foreground mb-1">
        {label} <span className="text-subtle-foreground">(0–10)</span>
      </label>
      <input
        id={id}
        type="number"
        min={0}
        max={10}
        step={0.5}
        value={value}
        onChange={onChange}
        className={INPUT_CLS}
        placeholder="0"
      />
    </div>
  );
}
