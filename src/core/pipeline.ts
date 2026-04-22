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
    this.selector = new VariantSelector(config.safety, estimator);
    this.policy = new PolicyEngine(config.policy);
    this.scorer = new SafetyScorer(config.safety);
  }

  async run(input: PipelineInput): Promise<PipelineOutput> {
    const { prompt, dryRun = this.config.safety.dryRun } = input;
    logger.debug(`Pipeline: input length=${prompt.length} chars, dryRun=${dryRun}`);

    // Step 1: Generate variants
    const variants = await this.optimizer.variantsAsync(prompt);
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
    const optimizedTokens = fallbackDecision.useOriginal
      ? selectionResult.original.estimatedTokens
      : this.estimator.estimate(optimized);
    const estimatedSavings = Math.max(
      0,
      selectionResult.original.estimatedTokens - optimizedTokens
    );
    const finalChosen = fallbackDecision.useOriginal
      ? selectionResult.original
      : {
          ...selectionResult.chosen,
          text: optimized,
          estimatedTokens: optimizedTokens,
          compressionRatio:
            optimizedTokens / Math.max(selectionResult.original.estimatedTokens, 1),
        };
    const finalSelectionResult = {
      ...selectionResult,
      chosen: finalChosen,
      estimatedSavings,
      safetyScore: finalSafety.score,
    };

    logger.info(
      `Pipeline: savings=${estimatedSavings} tokens, ` +
      `potential=${selectionResult.potentialSavings} tokens, ` +
      `safetyScore=${finalSafety.score.toFixed(3)}, ` +
      `fallback=${fallbackDecision.useOriginal}`
    );

    return {
      original: prompt,
      optimized,
      selectionResult: finalSelectionResult,
      policyInjection,
      safetyResult: finalSafety,
      estimatedSavings,
      potentialSavings: selectionResult.potentialSavings,
      fallbackUsed: fallbackDecision.useOriginal,
      dryRun,
    };
  }
}
