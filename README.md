# claude-token-optimizer

> 🇬🇧 [English](#english) | 🇹🇷 [Türkçe](#türkçe)

---

<a name="english"></a>
# English

A production-ready Claude Code plugin that reduces token consumption by optimizing prompts and tool outputs. Compresses excess whitespace, boilerplate, repeated content, and large JSON/log outputs while preserving semantic meaning.

## Table of Contents

- [Architecture](#architecture)
- [Installation](#installation)
- [Usage](#usage-cli)
- [Configuration](#configuration)
- [Library API](#library-api)
- [MCP Server](#mcp-server)
- [Claude Code Hooks](#claude-code-hooks)
- [Tests](#tests)
- [Roadmap](#roadmap)

## Architecture

```
src/
├── cli.ts                       # Commander-based CLI entry point
├── config.ts                    # Default settings + config loader
├── index.ts                     # Library API exports
├── logger.ts                    # Minimal leveled logger
├── mcp-server.ts                # MCP stdio JSON-RPC 2.0 server
├── types.ts                     # All TypeScript interfaces
├── utils/
│   ├── estimator.ts             # Heuristic token estimator (swappable)
│   ├── hash.ts                  # SHA-256 based CTX_ reference format
│   ├── json.ts                  # JSON clean + alias utilities
│   └── text.ts                  # Text processing primitives
├── modules/
│   ├── promptOptimizer.ts       # Prompt normalise + compress + variant generation
│   ├── jsonMinifier.ts          # JSON compact + key alias + null removal
│   ├── logFilter.ts             # Mode-aware log line filter
│   ├── diffFilter.ts            # Git diff large-file summary + whitespace hiding
│   ├── contextRegistry.ts       # Disk-cache + CTX_ reference system
│   ├── variantSelector.ts       # Choose cheapest safe variant
│   ├── safetyScorer.ts          # Heuristic similarity scorer
│   ├── semanticPhraseStore.ts   # Phrase DB for semantic compression
│   ├── englishSemanticProvider.ts # English synonym / abbreviation provider
│   └── intentCanonicalizer.ts   # Intent-aware prompt canonicalisation
├── core/
│   ├── pipeline.ts              # Combines all modules into one optimisation flow
│   ├── policies.ts              # Short-output / terse-mode instruction injection
│   └── fallback.ts              # Revert to original when safety threshold is breached
└── adapters/
    ├── hookAdapter.ts           # Claude Code hook API bridge (prePrompt/preToolUse/postToolUse)
    ├── pluginAdapter.ts         # Claude Code plugin manifest + lifecycle
    └── mcpAdapter.ts            # MCP tool call wrappers
```

## Installation

```bash
git clone <repo>
cd claude-token-optimizer
npm install
```

Run directly in development mode:

```bash
npm run dev -- <command> [options]
# or
npx tsx src/cli.ts <command> [options]
```

Production build:

```bash
npm run build
npm link   # makes the global `claude-token-optimizer` command available
```

## Usage (CLI)

### Optimize a prompt

```bash
claude-token-optimizer optimize \
  --input "Please could you kindly analyze the database connection timeout error in the authentication service logs"
```

Output:
```
=== TOKEN OPTIMIZER RESULT ===

Original (22 tokens):
Please could you kindly analyze the database connection timeout error in the authentication service logs

Candidates:
  [normalized]       22 tokens (100.0%)
  [alias-compressed] 14 tokens (63.6%)
  [terse-technical]  14 tokens (63.6%)

Chosen: [alias-compressed]
analyze the db conn timeout error in the auth service logs

Estimated savings: 8 tokens
Safety score: 0.526
```

### Optimize from a file

```bash
claude-token-optimizer optimize-file ./my-prompt.txt
claude-token-optimizer optimize-file ./my-prompt.txt --dry-run
```

### Filter logs

```bash
claude-token-optimizer filter-log --file ./app.log --mode docker
claude-token-optimizer filter-log --file ./app.log --mode npm --tail 30
claude-token-optimizer filter-log --file ./output.log --mode dotnet
```

Supported modes: `docker`, `journalctl`, `dotnet`, `npm`, `generic`

### Minify JSON

```bash
claude-token-optimizer minify-json --file ./big-response.json
claude-token-optimizer minify-json --input '{"name": "test", "value": null}' --remove-nulls
```

### Filter git diff

```bash
claude-token-optimizer filter-diff --file ./changes.diff
```

### Context Registry

```bash
# Store large content
claude-token-optimizer cache put --file ./huge-context.txt --tags "context,session1"
# → Stored as: CTX_ab12cd34

# Retrieve by reference
claude-token-optimizer cache get CTX_ab12cd34

# List all entries
claude-token-optimizer cache list
```

### Dry-run mode

```bash
claude-token-optimizer optimize --input "..." --dry-run
# Shows what would happen without making any changes
```

### Global options

```
--config <path>   Custom config JSON file
--dry-run         Simulate without applying changes
--debug           Debug log level
--quiet           Output results only
```

## Configuration

Copy and edit the example config:

```bash
cp src/examples/example-config.json my-config.json
claude-token-optimizer optimize --config my-config.json --input "..."
```

Key settings:

| Field | Default | Description |
|-------|---------|-------------|
| `promptOptimizer.dictionaryMap` | 20 terms | Replace long terms with short aliases |
| `promptOptimizer.removeBoilerplate` | `true` | Remove filler phrases like "please", "could you" |
| `promptOptimizer.deduplicateSentences` | `true` | Remove repeated sentences |
| `safety.threshold` | `0.50` | Fallback to original when compression ratio is below this |
| `logFilter.mode` | `"generic"` | Log filter mode |
| `logFilter.includeErrors` | `true` | Include `error/fatal/exception` lines |
| `logFilter.includeWarnings` | `true` | Include `warn/warning/notice` lines |
| `logFilter.includeFailures` | `true` | Include `failed/crash/unhealthy/exit code` lines |
| `logFilter.tailLines` | `0` | Keep last N lines (0 = all) |
| `policy.shortOutputPolicy` | `false` | Inject short-response instruction |
| `policy.maxOutputHint` | `null` | Target response token count |

> **Note:** `safety.threshold` is the single source of truth for the safety gate; the same value is used in both variant selection and the fallback decision.

`logFilter` flag behaviour:

| `includeErrors` | `includeWarnings` | `includeFailures` | Result |
|-----------------|-------------------|-------------------|--------|
| `true` | `false` | `false` | Only error/fatal/exception lines |
| `false` | `true` | `false` | Only warning/notice lines |
| `false` | `false` | `true` | Only failed/crash/exit-code lines |
| `false` | `false` | `false` | **Strict mode** — empty result `[]`, no passthrough |

## Library API

```typescript
import { OptimizationPipeline, defaultConfig, mergeConfig } from "claude-token-optimizer";

const config = mergeConfig({
  policy: { shortOutputPolicy: true },
  safety: { threshold: 0.45 },
});

const pipeline = new OptimizationPipeline(config);
const result = await pipeline.run({ prompt: "your prompt here" });

console.log(result.optimized);         // optimised text
console.log(result.fallbackUsed);      // true = original was used
console.log(result.selectionResult);   // variant details
```

### Per-module usage

```typescript
import { PromptOptimizer, LogFilter, ContextRegistry, defaultConfig } from "claude-token-optimizer";

// Prompt-only
const optimizer = new PromptOptimizer(defaultConfig.promptOptimizer);
const optimized = optimizer.optimize("your text");
const variants = optimizer.variants("your text");

// Log filtering
const filter = new LogFilter({ ...defaultConfig.logFilter, mode: "docker" });
const result = filter.filter(logContent);

// Registry
const registry = new ContextRegistry(defaultConfig.contextRegistry);
const ref = await registry.putOrRef(hugeContext);
const content = await registry.get(ref);
```

### Hook Adapter (Claude Code integration)

```typescript
import { HookAdapter, defaultConfig } from "claude-token-optimizer";

const adapter = new HookAdapter(defaultConfig);

const result = await adapter.handleHook({
  event: "prePrompt",
  content: "your prompt here",
});

console.log(result.content);      // optimised content
console.log(result.modified);     // whether a change was made
console.log(result.tokensaved);   // tokens saved
```

## MCP Server

Start the MCP server over stdio JSON-RPC 2.0:

```bash
npm run mcp
# or
npx tsx src/mcp-server.ts
```

Add to Claude Code's MCP config (`~/.claude/mcp_servers.json`):

```json
{
  "mcpServers": {
    "token-optimizer": {
      "command": "npx",
      "args": ["tsx", "/path/to/src/mcp-server.ts"]
    }
  }
}
```

Available MCP tools: `optimize_prompt`, `minify_json`, `filter_log`, `filter_diff`, `cache_put`, `cache_get`

## Claude Code Hooks

Install hooks automatically into `~/.claude/settings.json`:

```bash
npm run hooks:install
npm run hooks:uninstall
```

Hook events handled: `PreToolUse`, `PostToolUse`

## Tests

```bash
npm test                  # all tests
npm run test:watch        # watch mode
npm run test:coverage     # coverage report
```

## Roadmap

- [x] ~~**Real tokenizer integration** — `ClaudeTokenEstimator` via `@anthropic-ai/tokenizer`; `--estimator claude|heuristic` flag, lazy-load + graceful fallback~~
- [x] ~~**Claude Code hooks wiring** — automatic `PreToolUse`/`PostToolUse` hook injection via `scripts/install-hooks.ts`; `npm run hooks:install` / `hooks:uninstall` scripts~~
- [x] ~~**MCP server implementation** — `src/mcp-server.ts`: stdio JSON-RPC 2.0, 6 tools; `npm run mcp` to start~~
- [x] ~~**Semantic compression** — phrase DB + English semantic provider + intent canonicaliser~~
- [ ] **NLP-based safety scorer** — embedding similarity instead of Jaccard
- [ ] **Stream support** — line-by-line streaming for large log files
- [ ] **Registry TTL** — automatic purge of stale cache entries
- [ ] **Diff awareness** — track context across multiple change rounds
- [ ] **Session growth tracking** — increase compression aggressiveness as conversation grows
- [ ] **OpenTelemetry tracing** — spans for each pipeline step
- [ ] **Web UI** — local dashboard for optimise/registry viewing

---

<a name="türkçe"></a>
# Türkçe

Prompt ve araç çıktılarını optimize ederek Claude'a giden token tüketimini düşüren, üretime hazır bir Claude Code eklentisi. Anlamsal içeriği korurken fazla boşluk, dolgu metin, tekrar eden içerik ve büyük JSON/log çıktılarını sıkıştırır.

## İçindekiler

- [Mimari](#mimari)
- [Kurulum](#kurulum)
- [Kullanım](#kullanım-cli)
- [Konfigürasyon](#konfigürasyon)
- [Kütüphane API](#kütüphane-api)
- [MCP Sunucusu](#mcp-sunucusu)
- [Claude Code Hook'ları](#claude-code-hookları)
- [Testler](#testler)
- [Gelecek Geliştirmeler](#gelecek-geliştirmeler)

## Mimari

```
src/
├── cli.ts                       # Commander tabanlı CLI giriş noktası
├── config.ts                    # Varsayılan ayarlar + config yükleme
├── index.ts                     # Kütüphane API export'ları
├── logger.ts                    # Minimal seviyeli logger
├── mcp-server.ts                # MCP stdio JSON-RPC 2.0 sunucusu
├── types.ts                     # Tüm TypeScript arayüzleri
├── utils/
│   ├── estimator.ts             # Sezgisel token tahmincisi (değiştirilebilir)
│   ├── hash.ts                  # SHA-256 tabanlı CTX_ referans formatı
│   ├── json.ts                  # JSON temizleme + alias araçları
│   └── text.ts                  # Metin işleme primitifleri
├── modules/
│   ├── promptOptimizer.ts       # Prompt normalleştirme + sıkıştırma + varyant üretimi
│   ├── jsonMinifier.ts          # JSON sıkıştırma + anahtar alias'ı + null temizleme
│   ├── logFilter.ts             # Moda duyarlı log satır filtresi
│   ├── diffFilter.ts            # Git diff büyük dosya özeti + boşluk gizleme
│   ├── contextRegistry.ts       # Disk önbelleği + CTX_ referans sistemi
│   ├── variantSelector.ts       # En ucuz güvenli varyantı seç
│   ├── safetyScorer.ts          # Sezgisel benzerlik puanlayıcı
│   ├── semanticPhraseStore.ts   # Anlamsal sıkıştırma için ifade veritabanı
│   ├── englishSemanticProvider.ts # İngilizce eş anlamlı / kısaltma sağlayıcı
│   └── intentCanonicalizer.ts   # Niyet odaklı prompt kanonikleştirme
├── core/
│   ├── pipeline.ts              # Tüm modülleri tek bir optimizasyon akışında birleştirir
│   ├── policies.ts              # Kısa çıktı / özlü mod talimat enjeksiyonu
│   └── fallback.ts              # Güvenlik eşiği aşılırsa orijinale döner
└── adapters/
    ├── hookAdapter.ts           # Claude Code hook API köprüsü (prePrompt/preToolUse/postToolUse)
    ├── pluginAdapter.ts         # Claude Code eklenti manifestosu + yaşam döngüsü
    └── mcpAdapter.ts            # MCP araç çağrısı sarmalayıcıları
```

## Kurulum

```bash
git clone <repo>
cd claude-token-optimizer
npm install
```

Geliştirme modunda doğrudan çalıştırmak için:

```bash
npm run dev -- <komut> [seçenekler]
# veya
npx tsx src/cli.ts <komut> [seçenekler]
```

Üretim derlemesi:

```bash
npm run build
npm link   # global `claude-token-optimizer` komutunu kullanılabilir kılar
```

## Kullanım (CLI)

### Prompt optimize et

```bash
claude-token-optimizer optimize \
  --input "Please could you kindly analyze the database connection timeout error in the authentication service logs"
```

Çıktı:
```
=== TOKEN OPTIMIZER RESULT ===

Original (22 tokens):
Please could you kindly analyze the database connection timeout error in the authentication service logs

Candidates:
  [normalized]       22 tokens (100.0%)
  [alias-compressed] 14 tokens (63.6%)
  [terse-technical]  14 tokens (63.6%)

Chosen: [alias-compressed]
analyze the db conn timeout error in the auth service logs

Estimated savings: 8 tokens
Safety score: 0.526
```

### Dosyadan optimize et

```bash
claude-token-optimizer optimize-file ./my-prompt.txt
claude-token-optimizer optimize-file ./my-prompt.txt --dry-run
```

### Log filtrele

```bash
claude-token-optimizer filter-log --file ./app.log --mode docker
claude-token-optimizer filter-log --file ./app.log --mode npm --tail 30
claude-token-optimizer filter-log --file ./output.log --mode dotnet
```

Desteklenen modlar: `docker`, `journalctl`, `dotnet`, `npm`, `generic`

### JSON minify

```bash
claude-token-optimizer minify-json --file ./big-response.json
claude-token-optimizer minify-json --input '{"name": "test", "value": null}' --remove-nulls
```

### Git diff filtrele

```bash
claude-token-optimizer filter-diff --file ./changes.diff
```

### Context Registry

```bash
# Büyük içeriği kaydet
claude-token-optimizer cache put --file ./huge-context.txt --tags "context,session1"
# → Stored as: CTX_ab12cd34

# Referansla geri getir
claude-token-optimizer cache get CTX_ab12cd34

# Tüm kayıtları listele
claude-token-optimizer cache list
```

### Dry-run modu

```bash
claude-token-optimizer optimize --input "..." --dry-run
# Hiçbir şeyi değiştirmeden ne yapacağını gösterir
```

### Global seçenekler

```
--config <path>   Özel config JSON dosyası
--dry-run         Değişiklik uygulamadan simülasyon
--debug           Debug log seviyesi
--quiet           Sadece sonuç çıktısı
```

## Konfigürasyon

`src/examples/example-config.json` dosyasını kopyalayıp düzenleyin:

```bash
cp src/examples/example-config.json my-config.json
claude-token-optimizer optimize --config my-config.json --input "..."
```

Önemli ayarlar:

| Alan | Varsayılan | Açıklama |
|------|-----------|----------|
| `promptOptimizer.dictionaryMap` | 20 terim | Uzun terimleri kısa alias'larla değiştir |
| `promptOptimizer.removeBoilerplate` | `true` | "please", "could you" gibi dolgu ifadeleri temizle |
| `promptOptimizer.deduplicateSentences` | `true` | Tekrar eden cümleleri sil |
| `safety.threshold` | `0.50` | Bu değerin altındaki sıkıştırma oranlarında orijinale dön |
| `logFilter.mode` | `"generic"` | Log filtresi modu |
| `logFilter.includeErrors` | `true` | `error/fatal/exception` gibi satırları dahil et |
| `logFilter.includeWarnings` | `true` | `warn/warning/notice` gibi satırları dahil et |
| `logFilter.includeFailures` | `true` | `failed/crash/unhealthy/exit code` gibi satırları dahil et |
| `logFilter.tailLines` | `0` | Son N satırı tut (0 = hepsi) |
| `policy.shortOutputPolicy` | `false` | Kısa yanıt talimatı enjekte et |
| `policy.maxOutputHint` | `null` | Hedef yanıt token sayısı |

> **Not:** Güvenlik eşiği için tek kaynak `safety.threshold` alanıdır; varyant seçiminde de fallback kararında da aynı değer kullanılır.

`logFilter` bayraklarının etkisi:

| `includeErrors` | `includeWarnings` | `includeFailures` | Sonuç |
|-----------------|-------------------|-------------------|-------|
| `true` | `false` | `false` | Yalnızca error/fatal/exception satırları |
| `false` | `true` | `false` | Yalnızca warning/notice satırları |
| `false` | `false` | `true` | Yalnızca failed/crash/exit code satırları |
| `false` | `false` | `false` | **Strict mod** — boş sonuç `[]`, passthrough yok |

## Kütüphane API

```typescript
import { OptimizationPipeline, defaultConfig, mergeConfig } from "claude-token-optimizer";

const config = mergeConfig({
  policy: { shortOutputPolicy: true },
  safety: { threshold: 0.45 },
});

const pipeline = new OptimizationPipeline(config);
const result = await pipeline.run({ prompt: "your prompt here" });

console.log(result.optimized);         // optimize edilmiş metin
console.log(result.fallbackUsed);      // true ise orijinal kullanıldı
console.log(result.selectionResult);   // varyant detayları
```

### Modül bazlı kullanım

```typescript
import { PromptOptimizer, LogFilter, ContextRegistry, defaultConfig } from "claude-token-optimizer";

// Yalnızca prompt optimize
const optimizer = new PromptOptimizer(defaultConfig.promptOptimizer);
const optimized = optimizer.optimize("your text");
const variants = optimizer.variants("your text");

// Log filtrele
const filter = new LogFilter({ ...defaultConfig.logFilter, mode: "docker" });
const result = filter.filter(logContent);

// Registry
const registry = new ContextRegistry(defaultConfig.contextRegistry);
const ref = await registry.putOrRef(hugeContext);
const content = await registry.get(ref);
```

### Hook Adapter (Claude Code entegrasyonu)

```typescript
import { HookAdapter, defaultConfig } from "claude-token-optimizer";

const adapter = new HookAdapter(defaultConfig);

const result = await adapter.handleHook({
  event: "prePrompt",
  content: "your prompt here",
});

console.log(result.content);      // optimize edilmiş içerik
console.log(result.modified);     // değişiklik yapıldı mı
console.log(result.tokensaved);   // kaç token tasarruf edildi
```

## MCP Sunucusu

stdio JSON-RPC 2.0 üzerinden MCP sunucusunu başlatın:

```bash
npm run mcp
# veya
npx tsx src/mcp-server.ts
```

Claude Code'un MCP config'ine ekleyin (`~/.claude/mcp_servers.json`):

```json
{
  "mcpServers": {
    "token-optimizer": {
      "command": "npx",
      "args": ["tsx", "/path/to/src/mcp-server.ts"]
    }
  }
}
```

Kullanılabilir MCP araçları: `optimize_prompt`, `minify_json`, `filter_log`, `filter_diff`, `cache_put`, `cache_get`

## Claude Code Hook'ları

Hook'ları `~/.claude/settings.json` dosyasına otomatik yükleyin:

```bash
npm run hooks:install
npm run hooks:uninstall
```

Desteklenen hook olayları: `PreToolUse`, `PostToolUse`

## Testler

```bash
npm test                  # tüm testler
npm run test:watch        # izleme modu
npm run test:coverage     # kapsam raporu
```

## Gelecek Geliştirmeler

- [x] ~~**Gerçek tokenizer entegrasyonu** — `@anthropic-ai/tokenizer` ile `ClaudeTokenEstimator`; `--estimator claude|heuristic` seçeneği, lazy-load + graceful fallback~~
- [x] ~~**Claude Code hook bağlantısı** — `scripts/install-hooks.ts` ile `PreToolUse`/`PostToolUse` hook'larının otomatik enjeksiyonu; `npm run hooks:install` / `hooks:uninstall` scriptleri~~
- [x] ~~**MCP sunucu implementasyonu** — `src/mcp-server.ts`: stdio JSON-RPC 2.0, 6 araç; `npm run mcp` ile başlat~~
- [x] ~~**Anlamsal sıkıştırma** — ifade veritabanı + İngilizce anlamsal sağlayıcı + niyet kanonikleştirici~~
- [ ] **NLP tabanlı güvenlik puanlayıcı** — Jaccard yerine gömme benzerliği
- [ ] **Akış desteği** — büyük log dosyaları için satır satır akış işleme
- [ ] **Registry TTL** — eski önbellek girdilerini otomatik temizleme
- [ ] **Diff farkındalığı** — birden fazla değişiklik turunda bağlamı takip et
- [ ] **Oturum büyüme takibi** — konuşma büyüdükçe sıkıştırma yoğunluğunu artır
- [ ] **OpenTelemetry izleme** — her pipeline adımı için span
- [ ] **Web arayüzü** — yerel optimize/registry görüntüleme panosu
