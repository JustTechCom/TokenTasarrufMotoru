# claude-token-optimizer

Prompt ve tool çıktılarını optimize ederek Claude'a giden token tüketimini düşüren bir araç.
Semantic anlamı korurken fazla whitespace, boilerplate, tekrar eden içerik ve uzun JSON/log çıktılarını sıkıştırır.

## Mimari

```
src/
├── cli.ts                  # Commander tabanlı CLI giriş noktası
├── config.ts               # Varsayılan ayarlar + config yükleme
├── index.ts                # Library API export'ları
├── logger.ts               # Minimal leveled logger
├── types.ts                # Tüm TypeScript interface'leri
├── utils/
│   ├── estimator.ts        # Heuristic token tahmincisi (swap edilebilir)
│   ├── hash.ts             # SHA-256 tabanlı CTX_ referans formatı
│   ├── json.ts             # JSON clean + alias utilities
│   └── text.ts             # Metin işleme primitives
├── modules/
│   ├── promptOptimizer.ts  # Prompt normalize + sıkıştırma + variant üretimi
│   ├── jsonMinifier.ts     # JSON compact + key alias + null temizleme
│   ├── logFilter.ts        # Mode-aware log satır filtresi
│   ├── diffFilter.ts       # Git diff büyük dosya özeti + whitespace gizleme
│   ├── contextRegistry.ts  # Disk-cache + CTX_ referans sistemi
│   ├── variantSelector.ts  # En ucuz güvenli varyantı seç
│   └── safetyScorer.ts     # Heuristic benzerlik skoru
├── core/
│   ├── pipeline.ts         # Tüm modülleri birleştiren optimize akışı
│   ├── policies.ts         # Short output / terse mode instruction injection
│   └── fallback.ts         # Güvenlik eşiği aşılırsa original'a dön
└── adapters/
    ├── hookAdapter.ts      # Claude Code hook API köprüsü (prePrompt/preToolUse/postToolUse)
    ├── pluginAdapter.ts    # Claude Code plugin manifest + lifecycle
    └── mcpAdapter.ts       # MCP tool call wrapper'ları
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

Production build için:

```bash
npm run build
npm link   # global `claude-token-optimizer` komutunu kullanılabilir kılar
```

## Kullanım

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

### Dry run modu

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
| `promptOptimizer.removeBoilerplate` | `true` | "please", "could you" gibi ifadeleri temizle |
| `promptOptimizer.deduplicateSentences` | `true` | Tekrar eden cümleleri sil |
| `safety.threshold` | `0.50` | Bu değerin altındaki sıkıştırma oranlarında fallback |
| `logFilter.mode` | `"generic"` | Log filtresi modu |
| `logFilter.tailLines` | `0` | Son N satırı tut (0 = hepsi) |
| `policy.shortOutputPolicy` | `false` | Kısa yanıt talimatı inject et |
| `policy.maxOutputHint` | `null` | Hedef yanıt token sayısı |

## Library API

```typescript
import { OptimizationPipeline, defaultConfig, mergeConfig } from "claude-token-optimizer";

const config = mergeConfig({
  policy: { shortOutputPolicy: true },
  safety: { threshold: 0.45 },
});

const pipeline = new OptimizationPipeline(config);
const result = await pipeline.run({ prompt: "your prompt here" });

console.log(result.optimized);         // optimize edilmiş metin
console.log(result.fallbackUsed);      // true ise original kullanıldı
console.log(result.selectionResult);   // variant detayları
```

### Modül bazlı kullanım

```typescript
import { PromptOptimizer, LogFilter, ContextRegistry, defaultConfig } from "claude-token-optimizer";

// Sadece prompt optimize
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

// prePrompt hook'u simüle et
const result = await adapter.handleHook({
  event: "prePrompt",
  content: "your prompt here",
});

console.log(result.content);     // optimize edilmiş içerik
console.log(result.modified);    // değişiklik yapıldı mı
console.log(result.tokensaved);  // kaç token tasarruf edildi
```

## Testler

```bash
npm test                  # tüm testler
npm run test:watch        # watch mode
npm run test:coverage     # coverage raporu
```

## Gelecek Geliştirmeler

- [ ] **Gerçek tokenizer entegrasyonu** — `@anthropic-ai/tokenizer` veya `tiktoken` ile HeuristicEstimator'ı değiştir
- [ ] **Claude Code hooks bağlantısı** — hooks API stabil olduğunda HookAdapter'ı doğrudan `settings.json`'a bağla
- [ ] **MCP sunucu implementasyonu** — McpAdapter'ı gerçek MCP JSON-RPC server'a dönüştür
- [ ] **NLP-based safety scorer** — Jaccard yerine embedding benzerliği
- [ ] **Stream desteği** — büyük log dosyaları için satır satır akış işleme
- [ ] **Registry TTL** — eski cache girdilerini otomatik temizleme
- [ ] **Diff awareness** — birden fazla değişiklik turunda bağlamı takip et
- [ ] **Session growth tracking** — konuşma büyüdükçe sıkıştırma agresifliğini artır
- [ ] **OpenTelemetry tracing** — her pipeline adımı için span
- [ ] **Web UI** — lokal arayüzde optimize/registry görüntüleme
