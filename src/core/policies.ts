import { PolicyOptions, PolicyInjection } from "../types.js";

// ─── Policy Engine ────────────────────────────────────────────────────────────
//
// Produces optional prefix/suffix instructions to inject into the prompt.
// These guide the model toward shorter, more focused responses without
// breaking semantic content of the user's original request.

const SHORT_OUTPUT_SUFFIX =
  "\n\n[Respond concisely. Omit preambles and trailing summaries.]";

const TERSE_SUFFIX =
  "\n\n[Terse technical mode: use abbreviations, skip pleasantries, be direct.]";

const EXPLANATION_SUFFIX =
  "\n\n[Provide explanations only if explicitly requested.]";

const LOW_VERBOSITY_SUFFIX =
  "\n\n[Low verbosity: minimal prose, prefer structured output where applicable.]";

export class PolicyEngine {
  constructor(private opts: PolicyOptions) {}

  /**
   * Builds the injection object with prefix/suffix strings to wrap the prompt.
   */
  buildInjection(): PolicyInjection {
    const parts: string[] = [];

    if (this.opts.shortOutputPolicy) {
      parts.push(SHORT_OUTPUT_SUFFIX);
    }
    if (this.opts.terseResponseMode) {
      parts.push(TERSE_SUFFIX);
    }
    if (this.opts.explanationOnlyIfAsked) {
      parts.push(EXPLANATION_SUFFIX);
    }
    if (this.opts.injectLowVerbosityInstruction) {
      parts.push(LOW_VERBOSITY_SUFFIX);
    }
    if (this.opts.maxOutputHint !== null && this.opts.maxOutputHint > 0) {
      parts.push(
        `\n\n[Aim for a response under ${this.opts.maxOutputHint} tokens.]`
      );
    }

    const suffix = parts.join("").trim();
    return suffix ? { suffix } : {};
  }

  /**
   * Applies the injection to a prompt string.
   */
  apply(prompt: string): string {
    const injection = this.buildInjection();
    let result = prompt;
    if (injection.prefix) result = injection.prefix + "\n\n" + result;
    if (injection.suffix) result = result + "\n" + injection.suffix;
    return result;
  }
}
