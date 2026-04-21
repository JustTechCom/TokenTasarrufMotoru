type IntentKind =
  | "approval_prompt"
  | "approval_response"
  | "policy_instruction"
  | "technical_status_update"
  | "implementation_guidance"
  | "generic";

type IntentMatch = {
  kind: IntentKind;
  confidence: number;
};

type PolicySlots = {
  action?: string;
  outcome?: string;
  target?: string;
  prefix?: string;
  persistent?: boolean;
  approval?: "approve" | "deny";
};

type ProtectedTerm = {
  placeholder: string;
  value: string;
};

type OperatorContext = {
  protectedTerms: ProtectedTerm[];
  placeholderPattern: string;
};

type CompressionOperator = {
  name: string;
  apply: (text: string, context: OperatorContext) => string;
};

const PROTECTED_TERM_PATTERN =
  /`[^`]+`|\b[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)+\b|\b[a-z]+(?:[A-Z][a-zA-Z0-9]+)+\b|\b[A-Z][A-Z0-9_]{2,}\b/g;
const TECHNICAL_PROGRESS_SIGNALS = [
  /\b(?:now\s+)?i'?m\b/i,
  /\bi am\b/i,
  /\bhas been\b/i,
  /\bhave been\b/i,
  /\bonly remaining change\b/i,
  /\bremaining change\b/i,
];
const TECHNICAL_STATUS_VERBS = [
  /\breverted\b/i,
  /\bverified\b/i,
  /\bconfirm(?:ing|ed)?\b/i,
  /\brunning\b/i,
  /\btesting\b/i,
  /\bbuilding\b/i,
  /\btighten(?:ing|ed)?\b/i,
  /\badding\b/i,
];
const TECHNICAL_SUBJECTS = [
  /\bheuristic\b/i,
  /\bprompt\b/i,
  /\bchange\b/i,
  /\brequest\b/i,
  /\bexception\b/i,
  /\berrorhandler\b/i,
  /\bapp\.inject\b/i,
  /\bprocess\b/i,
  /\b500\b/i,
  /\btests?\b/i,
  /\bbuild(?:ing)?\b/i,
];
const GUIDANCE_ACTIONS = [
  /\bstore\b/i,
  /\bload\b/i,
  /\bwrite\b/i,
  /\bdelete\b/i,
  /\bpatch\b/i,
  /\bdebounce\b/i,
  /^\s*-\s+/m,
];
const GUIDANCE_CONTEXT = [
  /\bpopup\b/i,
  /\bbrowser\.storage(?:\.[a-z]+)?\b/i,
  /\brepository\b/i,
  /\brepo\b/i,
  /\bsource code\b/i,
  /\bdocs\b/i,
  /\bdraft\b/i,
  /\buseState\b/i,
  /\bstate\b/i,
  /\bsolution\b/i,
  /\bbridge\/\b/i,
];
const GUIDANCE_SIGNALS = [
  /\bThis behavior is a result of\b/i,
  /\bThe solution is clear\b/i,
  /\bI cannot directly patch\b/i,
  /\bdoes not contain the actual\b/i,
];

function cleanup(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/;\s*;/g, ";")
    .trim();
}

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function scoreTechnicalStatusIntent(text: string): number {
  const progressSignals = countMatches(text, TECHNICAL_PROGRESS_SIGNALS);
  const statusVerbs = countMatches(text, TECHNICAL_STATUS_VERBS);
  const technicalSubjects = countMatches(text, TECHNICAL_SUBJECTS);

  let score = 0;
  if (progressSignals > 0) score += 1;
  if (statusVerbs > 0) score += 1;
  if (technicalSubjects > 0) score += 1;
  if (statusVerbs > 1) score += 1;
  if (technicalSubjects > 1) score += 1;

  return score;
}

function scoreImplementationGuidanceIntent(text: string): number {
  const actions = countMatches(text, GUIDANCE_ACTIONS);
  const context = countMatches(text, GUIDANCE_CONTEXT);
  const signals = countMatches(text, GUIDANCE_SIGNALS);

  let score = 0;
  if (/^\s*-\s+/m.test(text)) score += 2;
  if (actions > 0) score += 1;
  if (context > 0) score += 1;
  if (actions > 1) score += 1;
  if (context > 1) score += 1;
  if (signals > 0) score += 1;

  return score;
}

function classifyIntent(text: string): IntentMatch {
  const trimmed = text.trim();

  if (/^(do you want to|would you like to|are you sure you want to)\b/i.test(trimmed)) {
    return { kind: "approval_prompt", confidence: 0.95 };
  }

  if (/^(yes|no)\b/i.test(trimmed) && /\b(don't ask again|do not ask again|ask again|start with)\b/i.test(trimmed)) {
    return { kind: "approval_response", confidence: 0.95 };
  }

  if (/\b(don't ask again|do not ask again|commands? that start with|allow this prefix|outside the sandbox)\b/i.test(trimmed)) {
    return { kind: "policy_instruction", confidence: 0.75 };
  }

  const technicalStatusScore = scoreTechnicalStatusIntent(trimmed);
  if (technicalStatusScore >= 3) {
    return {
      kind: "technical_status_update",
      confidence: Math.min(0.98, 0.65 + technicalStatusScore * 0.08),
    };
  }

  const implementationGuidanceScore = scoreImplementationGuidanceIntent(trimmed);
  if (implementationGuidanceScore >= 4) {
    return {
      kind: "implementation_guidance",
      confidence: Math.min(0.98, 0.64 + implementationGuidanceScore * 0.07),
    };
  }

  return { kind: "generic", confidence: 0 };
}

function extractPolicySlots(text: string): PolicySlots {
  const slots: PolicySlots = {};
  const trimmed = cleanup(text);

  const actionMatch = trimmed.match(
    /^(?:do you want to|would you like to|are you sure you want to)\s+(.+?)(?:\?|$)/i
  );
  if (actionMatch) {
    slots.action = cleanup(actionMatch[1]);
  }

  const prefixMatch = trimmed.match(/\bcommands?\s+that\s+start\s+with\s+(.+)$/i);
  if (prefixMatch) {
    slots.prefix = cleanup(prefixMatch[1]);
  }

  const targetMatch = trimmed.match(/\bfor\s+the\s+bridge\b/i);
  if (targetMatch) {
    slots.target = "bridge";
  }

  const outcomeMatch = trimmed.match(
    /\bto verify it can return\s+(.+?)(?:\s+for the bridge|\?|$)/i
  );
  if (outcomeMatch) {
    slots.outcome = cleanup(outcomeMatch[1]);
  }

  if (/\boutside the sandbox\b/i.test(trimmed)) {
    slots.target = slots.target ?? "sandbox";
  }

  if (/\bdon't ask again\b|\bdo not ask again\b/i.test(trimmed)) {
    slots.persistent = true;
  }

  if (/^yes\b/i.test(trimmed)) {
    slots.approval = "approve";
  } else if (/^no\b/i.test(trimmed)) {
    slots.approval = "deny";
  }

  return slots;
}

function maskProtectedTerms(text: string): { text: string; context: OperatorContext } {
  const protectedTerms: ProtectedTerm[] = [];
  const masked = text.replace(PROTECTED_TERM_PATTERN, (match) => {
    const placeholder = `__PROTECTED_${protectedTerms.length}__`;
    protectedTerms.push({ placeholder, value: match });
    return placeholder;
  });

  return {
    text: masked,
    context: {
      protectedTerms,
      placeholderPattern: "__PROTECTED_\\d+__",
    },
  };
}

function restoreProtectedTerms(text: string, context: OperatorContext): string {
  return context.protectedTerms.reduce(
    (result, protectedTerm) =>
      result.replace(new RegExp(protectedTerm.placeholder, "g"), protectedTerm.value),
    text
  );
}

function applyOperators(text: string, operators: CompressionOperator[]): string {
  const masked = maskProtectedTerms(cleanup(text));
  let result = masked.text;

  for (const operator of operators) {
    result = cleanup(operator.apply(result, masked.context));
  }

  return cleanup(restoreProtectedTerms(result, masked.context));
}

const TECHNICAL_STATUS_OPERATORS: CompressionOperator[] = [
  {
    name: "drop_passive_auxiliaries",
    apply: (text) => text.replace(/\b(?:was|were|is|are)\s+([a-z]+ed)\b/gi, "$1"),
  },
  {
    name: "drop_perfect_auxiliaries",
    apply: (text) =>
      text.replace(/\b(?:has|have|had)\s+been\s+((?:completely|fully|partially)\s+)?([a-z]+ed)\b/gi, "$1$2"),
  },
  {
    name: "rewrite_confirmation_clause",
    apply: (text) =>
      text
        .replace(/\b(?:I'?m\s+)?confirming(?:\s+this)?\s+with\b/gi, "confirming via")
        .replace(/\bconfirmed(?:\s+this)?\s+with\b/gi, "confirmed via")
        .replace(/\bconfirm(?:\s+this)?\s+with\b/gi, "confirm via"),
  },
  {
    name: "drop_determiners_before_modifiers",
    apply: (text) => text.replace(/\b(?:the|a|an)\s+(same|actual|temporary)\b/gi, "$1"),
  },
  {
    name: "compress_execution_context",
    apply: (text) => text.replace(/\bin the process\b/gi, "in-proc"),
  },
  {
    name: "rewrite_remaining_change_clause",
    apply: (text) =>
      text.replace(/\bThe only remaining change(?: now)? is\b/gi, "remaining change:")
        .replace(/\bOnly remaining change(?: now)? is\b/gi, "remaining change:")
        .replace(/\bThe remaining change(?: now)? is\b/gi, "remaining change:"),
  },
  {
    name: "rewrite_instrumentation_coordination",
    apply: (text, context) =>
      text.replace(
        new RegExp(`\\bwith\\s+(${context.placeholderPattern})\\s+and\\s+adding\\b`, "g"),
        "via $1; adding"
      ),
  },
  {
    name: "compress_temporary_modifier",
    apply: (text) => text.replace(/\btemporary\b/gi, "temp"),
  },
  {
    name: "compress_progress_lead_in",
    apply: (text) =>
      text.replace(/\b(?:Now\s+)?I'?m\s+([a-z]+ing)\b/gi, (_, verb: string) => capitalize(verb)),
  },
  {
    name: "compress_test_build_phrase",
    apply: (text) =>
      text
        .replace(/\btesting and building\b/gi, "tests/build")
        .replace(/\btesting\b/gi, "tests")
        .replace(/\bbuilding\b/gi, "build"),
  },
];

const IMPLEMENTATION_GUIDANCE_OPERATORS: CompressionOperator[] = [
  {
    name: "compress_behavior_intro",
    apply: (text) =>
      text.replace(
        /\bThis behavior is a result of the normal ([^:]+) lifecycle:/gi,
        "Normal $1 lifecycle:"
      ),
  },
  {
    name: "compress_closing_destroys_context",
    apply: (text) =>
      text.replace(
        /\bwhen the ([^,.;]+) closes, the ([^.;]+?) are completely destroyed\b/gi,
        "closing $1 destroys $2"
      ),
  },
  {
    name: "compress_repo_absence",
    apply: (text) =>
      text
        .replace(/\bThis repository currently does not contain\b/gi, "This repo lacks")
        .replace(/\bcurrently does not contain\b/gi, "lacks")
        .replace(/\bthe actual\b/gi, "the"),
  },
  {
    name: "compress_patchability",
    apply: (text) =>
      text
        .replace(/\bTherefore,?\s+I cannot directly patch\b/gi, "So I can't patch")
        .replace(/\bI cannot directly patch\b/gi, "can't patch"),
  },
  {
    name: "compress_solution_label",
    apply: (text) =>
      text
        .replace(/\bThe solution is clear:/gi, "Fix:")
        .replace(/\bFix:\s+-\s+/g, "Fix:\n- "),
  },
  {
    name: "compress_state_storage_clause",
    apply: (text) =>
      text
        .replace(/\bIf the state is only stored in\b/gi, "If state is only in")
        .replace(/\bstarts from scratch\b/gi, "resets")
        .replace(/\bwhen the popup is reopened\b/gi, "on popup reopen"),
  },
  {
    name: "merge_common_storage_targets",
    apply: (text) =>
      text.replace(
        /\bbrowser\.storage\.session\s+or\s+browser\.storage\.local\b/gi,
        "browser.storage.session/local"
      ),
  },
  {
    name: "compress_timing_phrases",
    apply: (text) =>
      text
        .replace(/\bas soon as\b/gi, "when")
        .replace(/\bwhen the popup opens\b/gi, "when popup opens")
        .replace(/\bwhen the operation is successfully completed\b/gi, "on success")
        .replace(/\bor if the user clicks\b/gi, "or user clicks")
        .replace(/\bif the user clicks\b/gi, "if user clicks")
        .replace(/\bor user clicks ["']?clear["']?/gi, "or clear"),
  },
  {
    name: "compress_bullet_articles",
    apply: (text) =>
      text
        .replace(/(^|\n)-\s+(Store|Load|Delete)\s+the\b/gi, "$1- $2")
        .replace(/(^|\n)-\s+Load saved draft state\b/gi, "$1- Load saved draft")
        .replace(/(^|\n)-\s+Delete draft from storage\b/gi, "$1- Delete draft"),
  },
  {
    name: "compress_debounce_instruction",
    apply: (text) =>
      text.replace(
        /\bWrite to ([^.;,\n]+) with debounce as the ([^.;,\n]+) changes\b/gi,
        "Debounce writes to $1 on $2 change"
      ),
  },
];

function canonicalizeApprovalPrompt(text: string): string {
  const slots = extractPolicySlots(text);
  const result = cleanup(text)
    .replace(/^(do you want to|would you like to|are you sure you want to)\s+/i, "")
    .replace(/\brun a one-off\b/gi, "run one-off")
    .replace(/\boutside the sandbox\b/gi, "outside sandbox")
    .replace(/\bto verify it can return\b/gi, "to verify")
    .replace(/\bfor the bridge\b/gi, "for bridge");

  if (!slots.action) {
    return cleanup(result);
  }

  return cleanup(
    slots.action
      .replace(/\brun a one-off\b/gi, "run one-off")
      .replace(/\boutside the sandbox\b/gi, "outside sandbox")
      .replace(/\bto verify it can return\b/gi, "to verify")
      .replace(/\bfor the bridge\b/gi, "for bridge")
  );
}

function canonicalizeApprovalResponse(text: string): string {
  const slots = extractPolicySlots(text);
  const parts: string[] = [];

  if (slots.approval === "approve") {
    parts.push("Yes");
  } else if (slots.approval === "deny") {
    parts.push("No");
  }

  if (slots.persistent) {
    parts.push("don't ask again");
  }

  if (slots.prefix) {
    parts.push(`for cmds starting with ${slots.prefix}`);
  }

  return parts.length === 0 ? cleanup(text) : cleanup(parts.join("; "));
}

function canonicalizePolicyInstruction(text: string): string {
  const slots = extractPolicySlots(text);
  const parts: string[] = [];

  if (slots.persistent) {
    parts.push("no re-ask");
  }

  if (slots.prefix) {
    parts.push(`for cmds starting with ${slots.prefix}`);
  }

  if (parts.length > 0) {
    return cleanup(parts.join(" "));
  }

  return cleanup(text)
    .replace(/\boutside the sandbox\b/gi, "outside sandbox")
    .replace(/\bcommands?\s+that\s+start\s+with\b/gi, "cmds starting with");
}

function canonicalizeTechnicalStatusUpdate(text: string): string {
  return applyOperators(text, TECHNICAL_STATUS_OPERATORS);
}

function canonicalizeImplementationGuidance(text: string): string {
  return applyOperators(text, IMPLEMENTATION_GUIDANCE_OPERATORS);
}

export function canonicalizeIntentAwareText(text: string): string {
  const intent = classifyIntent(text);

  if (intent.confidence < 0.7) {
    return text;
  }

  switch (intent.kind) {
    case "approval_prompt":
      return canonicalizeApprovalPrompt(text);
    case "approval_response":
      return canonicalizeApprovalResponse(text);
    case "policy_instruction":
      return canonicalizePolicyInstruction(text);
    case "technical_status_update":
      return canonicalizeTechnicalStatusUpdate(text);
    case "implementation_guidance":
      return canonicalizeImplementationGuidance(text);
    default:
      return text;
  }
}

export function detectIntentKind(text: string): IntentKind {
  return classifyIntent(text).kind;
}
