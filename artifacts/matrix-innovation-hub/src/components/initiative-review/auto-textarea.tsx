import { useLayoutEffect, useRef, useEffect, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface AutoTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  value: string;
  onValueChange: (value: string) => void;
  singleLine?: boolean;
}

/** Grows with its content; never scrolls internally. Prints as plain prose. */
export function AutoTextarea({ value, onValueChange, singleLine, className, onKeyDown, ...rest }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        data-autoexpand="true"
        className={cn("brief-edit", className)}
        onChange={e => onValueChange(singleLine ? e.target.value.replace(/\n/g, " ") : e.target.value)}
        onKeyDown={e => {
          if (singleLine && e.key === "Enter") e.preventDefault();
          onKeyDown?.(e);
        }}
        {...rest}
      />
      <div className={cn("brief-print-text", className)} aria-hidden="true">{value || rest.placeholder}</div>
    </>
  );
}
