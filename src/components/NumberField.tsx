import { useEffect, useRef, useState } from 'react';
import { parseNumber } from '../lib/units';

/**
 * A number input that keeps what you type (e.g. "82." mid-entry) and reports
 * the parsed value. It only resyncs from `value` while not focused.
 */
export function NumberField({
  value,
  onChange,
  placeholder,
  className,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  className?: string;
  label: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : String(value));
  }, [value]);

  return (
    <input
      className={className}
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(value == null ? '' : String(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseNumber(e.target.value));
      }}
    />
  );
}
