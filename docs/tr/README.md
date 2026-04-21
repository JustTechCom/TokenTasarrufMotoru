# claude-token-optimizer

> Bu sayfa projenin Turkce dokumantasyonudur. Ingilizce ana belge icin [README.md](../../README.md) dosyasina gidin.

Claude Code istemleri ve arac ciktilarindaki gereksiz token tuketimini azaltan bir CLI, kutuphane ve entegrasyon seti. Prompt sikistirma, JSON kucultme, log filtreleme, diff temizleme ve baglam onbellekleme ozelliklerini tek akista toplar.

## Icindekiler

- [Genel Bakis](#genel-bakis)
- [Kurulum](#kurulum)
- [Hizli Baslangic](#hizli-baslangic)
- [CLI Sozdizimi](#cli-sozdizimi)
- [Flag Kullanim Rehberi](#flag-kullanim-rehberi)
- [Komut Referansi](#komut-referansi)
- [Konfigurasyon](#konfigurasyon)
- [Claude Code Hook'lari](#claude-code-hooklari)
- [MCP Sunucusu](#mcp-sunucusu)
- [Kutuphane API](#kutuphane-api)
- [Testler](#testler)
- [Proje Yapisi](#proje-yapisi)

## Genel Bakis

Bu proje asagidaki kullanim senaryolari icin tasarlandi:

- Uzun prompt'lari anlamsal icerigi koruyarak kisaltmak
- Buyuk JSON ciktilarini daha ekonomik hale getirmek
- Gurultulu log dosyalarindan sadece onemli satirlari cikarmak
- Buyuk git diff'lerini LLM'e daha uygun bir forma sokmak
- Buyuk icerikleri `CTX_` referanslariyla disk ustunde saklamak
- Ogrenilmis semantik kisaltmalari proje bazinda tekrar kullanmak

## Kurulum

Node.js `18+` gerekir.

```bash
git clone <repo>
cd claude-token-optimizer
npm install
```

Gelistirme modunda:

```bash
npm run dev -- --help
```

Derlenmis CLI ile:

```bash
npm run build
node dist/cli.js --help
```

Global komut olarak baglamak isterseniz:

```bash
npm link
claude-token-optimizer --help
```

## Hizli Baslangic

Prompt optimize et:

```bash
claude-token-optimizer optimize \
  --input "Please could you kindly analyze the database connection timeout error in the authentication service logs"
```

Dosyadan prompt optimize et:

```bash
claude-token-optimizer optimize-file ./prompts/error-report.txt
```

Log dosyasini filtrele:

```bash
claude-token-optimizer filter-log --file ./app.log --mode docker --tail 30
```

JSON kucult:

```bash
claude-token-optimizer minify-json \
  --input '{"name":"test","value":null}' \
  --remove-nulls
```

Context Registry icine buyuk icerik kaydet:

```bash
claude-token-optimizer cache put --file ./huge-context.txt --tags "incident,auth"
claude-token-optimizer cache list
```

## CLI Sozdizimi

Temel desen:

```bash
claude-token-optimizer [global-flagler] <komut> [komut-flagleri]
```

Pratik kural:

- Global flag'leri komuttan once yazin
- Komuta ozel flag'leri komuttan sonra yazin
- Metin argumanlarinda cift tirnak kullanin
- Dosya yolu veriyorsaniz `--file`, inline veri veriyorsaniz `--input` kullanin

Ornek:

```bash
claude-token-optimizer --debug --config ./optimizer.config.json optimize --input "Summarize this log"
```

## Flag Kullanim Rehberi

### 1. Global flag nasil kullanilir?

Global flag tum komut cagrIsIna etki eder:

```bash
claude-token-optimizer --quiet optimize-file ./prompt.txt
claude-token-optimizer --config ./optimizer.config.json filter-log --file ./app.log
```

Desteklenen global flag'ler:

| Flag | Ne yapar | Not |
|------|----------|-----|
| `--config <path>` | JSON config dosyasi yukler | Config kullanan komutlarda gecerlidir |
| `--dry-run` | Degisikligi simule eder | Ozellikle optimize akisinda faydalidir |
| `--estimator <type>` | Token tahmincisini secer | `heuristic` veya `claude` |
| `--debug` | Ayrintili log acar | Sorun ayiklama icin |
| `--quiet` | Bilgi loglarini susturur | Cikti odakli kullanim icin |

### 2. Komuta ozel flag nasil kullanilir?

Komuta ozel flag sadece ilgili komuta etki eder:

```bash
claude-token-optimizer optimize --input "Explain the error"
claude-token-optimizer filter-log --file ./app.log --mode npm --tail 50
claude-token-optimizer semantic learn --from "database connection" --to "db conn"
```

### 3. `--file` ve `--input` ne zaman kullanilir?

- Dosyadan okuyacaksaniz `--file`
- Komut satirinda kisa veri verecekseniz `--input`
- Bir komutta ikisi birden verilirse uygulama once `--file` degerini kullanir

Ornek:

```bash
claude-token-optimizer minify-json --file ./response.json
claude-token-optimizer minify-json --input '{"ok":true}'
```

### 4. `--dry-run` nasil calisir?

`--dry-run`, islemi fiilen uygulamadan sonucun nasil olacagini gosterir.

```bash
claude-token-optimizer --dry-run optimize --input "Please carefully analyze this issue"
claude-token-optimizer optimize-file ./prompt.txt --dry-run
```

### 5. `--config` ile komut flag'leri birlikte nasil calisir?

Once config yuklenir, sonra komutta verdiginiz flag'ler config degerlerini gerektiginde ezer.

Ornek:

```bash
claude-token-optimizer \
  --config ./optimizer.config.json \
  filter-log \
  --file ./app.log \
  --mode docker \
  --tail 100
```

Burada `mode` ve `tail` komut satirindan gelir; diger log filtre ayarlari config dosyasindan alinabilir.

## Komut Referansi

### `optimize`

Bir prompt metnini optimize eder.

```bash
claude-token-optimizer optimize --input "Analyze the authentication timeout issue"
```

| Flag | Zorunlu | Aciklama |
|------|---------|----------|
| `--input <text>` | Evet | Optimize edilecek prompt |
| `--config <path>` | Hayir | Komut bazinda config |
| `--dry-run` | Hayir | Sonucu simule eder |

Ipuclari: Token tahmincisi secmek icin global `--estimator heuristic` veya `--estimator claude` kullanin.

### `optimize-file`

Dosyadaki prompt icerigini optimize eder.

```bash
claude-token-optimizer optimize-file ./my-prompt.txt
claude-token-optimizer --estimator heuristic optimize-file ./my-prompt.txt --dry-run
```

| Flag / Arguman | Zorunlu | Aciklama |
|----------------|---------|----------|
| `<file>` | Evet | Girdi dosyasi |
| `--config <path>` | Hayir | Config dosyasi |
| `--dry-run` | Hayir | Simulasyon modu |

### `filter-log`

Log ciktisindan sadece anlamli satirlari birakir.

```bash
claude-token-optimizer filter-log --file ./app.log --mode docker
claude-token-optimizer filter-log --file ./worker.log --mode npm --tail 30
```

| Flag | Zorunlu | Aciklama |
|------|---------|----------|
| `--file <path>` | Evet | Filtrelenecek log dosyasi |
| `--mode <mode>` | Hayir | `docker`, `journalctl`, `dotnet`, `npm`, `generic` |
| `--tail <n>` | Hayir | Son N eslesen satiri dondurur |

Not: `includeErrors`, `includeWarnings`, `includeFailures` gibi ayrintilar CLI flag degil, config alanidir.

### `minify-json`

JSON icerigini kucultur.

```bash
claude-token-optimizer minify-json --file ./payload.json
claude-token-optimizer minify-json --input '{"a":1,"b":null}' --remove-nulls
```

| Flag | Zorunlu | Aciklama |
|------|---------|----------|
| `--file <path>` | Kosullu | JSON dosyasi |
| `--input <text>` | Kosullu | JSON string'i |
| `--remove-nulls` | Hayir | `null` alanlari kaldirir |

### `filter-diff`

Git diff icerigini LLM'e daha uygun hale getirir.

```bash
claude-token-optimizer filter-diff --file ./changes.diff
claude-token-optimizer filter-diff --file ./changes.diff --no-hide-whitespace
```

| Flag | Zorunlu | Aciklama |
|------|---------|----------|
| `--file <path>` | Evet | Diff dosyasi |
| `--no-hide-whitespace` | Hayir | Sadece whitespace degisikliklerini de korur |

### `cache`

Buyuk icerikleri referans bazli saklar.

Icerik ekle:

```bash
claude-token-optimizer cache put --input "very large context" --tags "session-1,debug"
claude-token-optimizer cache put --file ./context.txt
```

Icerik cek:

```bash
claude-token-optimizer cache get CTX_ab12cd34
```

Listele:

```bash
claude-token-optimizer cache list
```

`cache put` flag'leri:

| Flag | Zorunlu | Aciklama |
|------|---------|----------|
| `--file <path>` | Kosullu | Kaydedilecek dosya |
| `--input <text>` | Kosullu | Kaydedilecek metin |
| `--tags <tags>` | Hayir | Virgulle ayrilmis etiketler |

### `semantic`

Ogrenilmis semantik kisaltmalari yonetir.

Yeni ifade ogret:

```bash
claude-token-optimizer semantic learn \
  --from "database connection" \
  --to "db conn" \
  --locale en
```

Listele:

```bash
claude-token-optimizer semantic list --locale any
```

Toplu ice aktar:

```bash
claude-token-optimizer semantic import --file ./phrases.json --locale tr
```

`semantic learn`:

| Flag | Zorunlu | Aciklama |
|------|---------|----------|
| `--from <text>` | Evet | Uzun ifade |
| `--to <text>` | Evet | Kisa karsilik |
| `--locale <locale>` | Hayir | `en`, `tr`, `any` |

`semantic list`:

| Flag | Zorunlu | Aciklama |
|------|---------|----------|
| `--locale <locale>` | Hayir | Listeyi locale gore filtreler |

`semantic import`:

| Flag | Zorunlu | Aciklama |
|------|---------|----------|
| `--file <path>` | Evet | JSON dizi dosyasi |
| `--locale <locale>` | Hayir | Kayitta locale yoksa varsayilan deger |

Beklenen JSON bicimi:

```json
[
  { "from": "database connection", "to": "db conn", "locale": "en" },
  { "from": "kimlik dogrulama servisi", "to": "auth servis", "locale": "tr" }
]
```

## Konfigurasyon

Ornek dosya:

```bash
cp src/examples/example-config.json ./optimizer.config.json
```

Ardindan:

```bash
claude-token-optimizer --config ./optimizer.config.json optimize --input "Explain this stack trace"
```

Onemli alanlar:

| Alan | Varsayilan | Aciklama |
|------|------------|----------|
| `safety.threshold` | `0.40` | Guvenlik esigi |
| `promptOptimizer.removeBoilerplate` | `true` | Dolgu ifadeleri temizler |
| `promptOptimizer.deduplicateSentences` | `true` | Tekrar eden cumleleri atar |
| `promptOptimizer.semanticCompression.enabled` | `true` | Semantik sikistirmayi acar |
| `promptOptimizer.semanticCompression.projectPhraseDbPath` | `.claude-token-optimizer/semantic-phrases.json` | Ogrenilmis ifadelerin yolu |
| `logFilter.customPatterns` | `[]` | Ozel log desenleri |
| `contextRegistry.cacheDir` | `.claude-token-optimizer/cache` | Cache dizini |
| `diffFilter.hideWhitespaceOnly` | `true` | Bosluk-only degisiklikleri gizler |

Log filtresi davranis matrisi:

| `includeErrors` | `includeWarnings` | `includeFailures` | Sonuc |
|-----------------|-------------------|-------------------|-------|
| `true` | `false` | `false` | Sadece `error/fatal/exception` |
| `false` | `true` | `false` | Sadece `warn/warning/notice` |
| `false` | `false` | `true` | Sadece `failed/crash/exit code` |
| `false` | `false` | `false` | Bos sonuc `[]` |

## Claude Code Hook'lari

Global kurulum:

```bash
npm run hooks:install
```

Proje bazli kurulum:

```bash
npm run hooks:install:project
```

Dry-run:

```bash
npm run hooks:dry-run
```

Kaldirma:

```bash
npm run hooks:uninstall
```

Bu script'ler `PreToolUse` ve `PostToolUse` hook'larini ayarlar. `--project` bayragi hook'lari gecerli projenin `.claude/settings.json` dosyasina yazar.

## MCP Sunucusu

Baslat:

```bash
npm run mcp
```

Alternatif:

```bash
npx tsx src/mcp-server.ts
```

Kullanilabilir araclar:

- `optimize_prompt`
- `minify_json`
- `filter_log`
- `filter_diff`
- `cache_put`
- `cache_get`

## Kutuphane API

```ts
import { OptimizationPipeline, mergeConfig } from "claude-token-optimizer";

const config = mergeConfig({
  policy: { shortOutputPolicy: true },
  safety: { threshold: 0.45 },
});

const pipeline = new OptimizationPipeline(config);
const result = await pipeline.run({ prompt: "Analyze the auth timeout log" });

console.log(result.optimized);
console.log(result.fallbackUsed);
```

## Testler

```bash
npm test
npm run test:watch
npm run test:coverage
```

## Proje Yapisi

```text
src/
├── cli.ts
├── config.ts
├── mcp-server.ts
├── core/
├── modules/
├── adapters/
└── utils/
```

Ana moduller:

- `promptOptimizer`: prompt sikistirma ve varyant uretimi
- `jsonMinifier`: JSON kucultme
- `logFilter`: log satiri filtreleme
- `diffFilter`: diff sadelestirme
- `contextRegistry`: disk ustu `CTX_` kayit sistemi
- `englishSemanticProvider`: ogrenilmis kisaltmalar ve semantik eslestirme
