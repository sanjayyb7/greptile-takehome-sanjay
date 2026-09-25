import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PasskeyField, usePasskey } from "./passkey";
import "./styles.css";

/**
 * A page for the tests, loaded from harness.html by the dev server and never built.
 *
 * The demo page checks codes with the two-second stand-in and offers no reset, so the
 * cases that matter here — a reset, an unmount or a newer attempt landing before an old
 * check answers — cannot be reached from it. Here the check is answered by hand: every
 * call waits until a test resolves it, and every callback is written down.
 *
 *   ?field   the whole PasskeyField
 *   (none)   usePasskey alone, with bare inputs, for reset — the field does not expose it
 */
type Harness = {
  /** answer the nth check that was asked for */
  resolve(n: number, ok: boolean): void;
  /** how many checks have been asked for */
  asked(): number;
  success: string[];
  complete: string[];
  reset(): void;
  unmount(): void;
};
declare global { interface Window { harness: Harness } }

const answers: ((ok: boolean) => void)[] = [];
const verify = () => new Promise<boolean>((resolve) => { answers.push(resolve); });
const harness: Harness = {
  resolve: (n, ok) => answers[n]?.(ok),
  asked: () => answers.length,
  success: [],
  complete: [],
  reset: () => {},
  unmount: () => root.render(null),
};
window.harness = harness;

function Hook() {
  const p = usePasskey({ onVerify: verify, onSuccess: (code) => harness.success.push(code) });
  useEffect(() => { harness.reset = p.reset; }, [p.reset]);
  return (
    <div className="hook" data-status={p.status} data-problem={p.problem ?? ""}>
      {p.digits.map((d, i) => (
        <input key={i} ref={(el) => { p.cells.current[i] = el; }} value={d}
          aria-label={`Digit ${i + 1} of ${p.digits.length}`} readOnly={p.busy}
          onChange={(e) => p.onInput(i, e)} onKeyDown={(e) => p.onKeyDown(i, e)}
          onFocus={(e) => p.onFocus(i, e)} onBlur={p.onBlur} onPaste={p.onPaste} />
      ))}
    </div>
  );
}

const field = new URLSearchParams(location.search).has("field");
const root: Root = createRoot(document.getElementById("root")!);
root.render(field
  ? <PasskeyField onVerify={verify}
      onSuccess={(code) => harness.success.push(code)}
      onSuccessAnimationComplete={(code) => harness.complete.push(code)} />
  : <Hook />);
