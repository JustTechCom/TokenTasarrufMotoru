import { OptimizationConfig, PipelineInput, PipelineOutput, TokenEstimator } from "../types.js";
import { PromptOptimizer } from "../modules/promptOptimizer.js";
import { VariantSelector } from "../modules/variantSelector.js";
import { PolicyEngine } from "./policies.js";
import { SafetyScorer } from "../modules/safetyScorer.js";
import { decideFallback } from "./fallback.js";
import { defaultEstimator } from "../utils/estimator.js";
import { logger } from "../logger.js";

// ─── Optimization Pipeline ────────────────────────────────────────────────────
//
// Flow:
//   1. Generate prompt variants (PromptOptimizer)
//   2. Select best safe variant (VariantSelector + SafetyScorer)
//   3. Apply policy injections (PolicyEngine)
//   4. Decide fallback (safety or dry-run)
//   5. Return PipelineOutput

export class OptimizationPipeline {
  private optimizer: PromptOptimizer;
  private selector: VariantSelector;
  private policy: PolicyEngine;
  private scorer: SafetyScorer;

  constructor(
    private config: OptimizationConfig,
    private estimator: TokenEstimator = defaultEstimator
  ) {
    this.optimizer = new PromptOptimizer(config.promptOptimizer, estimator);
    this.selector = new VariantSelector(
      config.variantSelector,
      config.safety,
      estimator
    );
    this.policy = new PolicyEngine(config.policy);
    this.scorer = new SafetyScorer(config.safety);
  }

  async run(input: PipelineInput): Promise<PipelineOutput> {
    const { prompt, dryRun = this.config.safety.dryRun } = input;
    logger.debug(`Pipeline: input length=${prompt.length} chars, dryRun=${dryRun}`);

    // Step 1: Generate variants
    const variants = this.optimizer.variants(prompt);
    logger.debug(`Pipeline: generated ${variants.length} variants`);

    // Step 2: Select best safe variant (skips "original" label)
    const nonOriginalVariants = variants.filter((v) => v.label !== "original");
    const selectionResult = this.selector.select(prompt, nonOriginalVariants);

    // Step 3: Apply policy injections to chosen text
    const policyInjection = this.policy.buildInjection();
    const chosenWithPolicy = this.policy.apply(selectionResult.chosen.text);

    // Step 4: Final safety check on policy-injected version
    const finalSafety = this.scorer.score(prompt, chosenWithPolicy);

    // Step 5: Fallback decision
    const fallbackDecision = decideFallback(finalSafety, dryRun);

    const optimized = fallbackDecision.useOriginal
      ? prompt
      : chosenWithPolicy;

    logger.info(
      `Pipeline: savings=${selectionResult.estimatedSavings} tokens, ` +
      `safetyScore=${selectionResult.safetyScore.toFixed(3)}, ` +
      `fallback=${fallbackDecision.useOriginal}`
    );

    return {
      original: prompt,
      optimized,
      selectionResult,
      policyInjection,
      safetyResult: finalSafety,
      fallbackUsed: fallbackDecision.useOriginal,
      dryRun,
    };
  }
}
