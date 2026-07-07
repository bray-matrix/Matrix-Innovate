import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Info } from "lucide-react";

interface InfoHintProps {
  title: string;
  howCalculated: string;
  inputs?: string[];
  userEntered?: string[];
  systemGenerated?: string[];
}

// Small information icon that explains how a calculated value is derived:
// the formula/logic, which inputs affect it, and which values are
// user-entered vs system-generated.
export function InfoHint({
  title,
  howCalculated,
  inputs,
  userEntered,
  systemGenerated,
}: InfoHintProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`How is ${title} calculated?`}
          className="inline-flex items-center text-muted-foreground hover:text-foreground align-middle"
          onClick={(e) => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        <div className="space-y-3">
          <div>
            <div className="font-semibold">{title}</div>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              {howCalculated}
            </p>
          </div>
          {inputs && inputs.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Inputs that affect this value
              </div>
              <ul className="mt-1 space-y-0.5">
                {inputs.map((input) => (
                  <li key={input} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                    <span>{input}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {userEntered && userEntered.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                User-entered values
              </div>
              <ul className="mt-1 space-y-0.5">
                {userEntered.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#00A3E0]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {systemGenerated && systemGenerated.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                System-generated values
              </div>
              <ul className="mt-1 space-y-0.5">
                {systemGenerated.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#FFC72C]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
