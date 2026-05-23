# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start dev server at http://localhost:3000
npm run build      # Production build
npm run preview    # Preview production build
npm run lint       # Type-check with tsc --noEmit (no test runner configured)
npm run clean      # Remove dist/
```

There is no test framework configured in this project.

## Environment Setup

Copy `.env.example` to `.env.local` and set:
- `GEMINI_API_KEY` — required for both the in-app chat and the serverless bot functions

**Important:** `GEMINI_API_KEY` is injected into the client bundle at **build time** via Vite's `define` option. Changing it in `.env.local` requires a full rebuild — a running dev server won't pick up the new value.

Firebase client config is loaded from `firebase-applet-config.json` (not an env variable). The Firestore database ID is read from that file via `firebaseConfig.firestoreDatabaseId`. This file is tracked in git and managed by AI Studio — do not create it manually.

Required env vars for Vercel serverless functions (`api/`):
- `FIREBASE_SERVICE_ACCOUNT` (full JSON string of Firebase Admin service account)
- `FIRESTORE_DATABASE_ID`
- `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- `TELEGRAM_BOT_TOKEN`

## Architecture

**Stack:** React 19 + Vite 6 + TypeScript + Tailwind CSS v4 + Firebase + Gemini AI

Mobile-first PWA for Colombian street vendors / microbusiness owners. The UI is entirely in Spanish.

### Application Flow

`App.tsx` is the root. It subscribes to Firebase Auth and then opens four `onSnapshot` listeners (sales, expenses, debts, inventory) per authenticated user. All data lives in `App` state and flows down as props — there is no React context or state manager. Views are selected by a single `activeTab: Tab` state.

`?verificar=CODE` in the URL short-circuits the normal flow and renders `<VerificationView>` before auth (used for passport identity verification — the code is looked up in the publicly-readable `passportVerifications/{code}` Firestore collection).

`<Auth>` supports two registration paths: standard email/password and a "manual" mode for users without an email, where the app auto-generates a synthetic email from their phone number. The generated email is shown to the user so they can log in again later.

### Tab / View Mapping

| Tab value     | Component             | Description                          |
|---------------|-----------------------|--------------------------------------|
| `inicio`      | `Dashboard`           | Balance summary + weekly chart + recent transactions |
| `finanzas`    | `FinanceView`         | Financial reports/history            |
| `camara`      | `CameraView`          | Camera-based receipt/product scan    |
| `inventario`  | `InventorySalesView`  | Inventory and sales management       |
| `pasaporte`   | `PassportView`        | Credit score ("pasaporte") + PDF export |
| `perfil`      | `ProfileView`         | User profile editor + bot linking    |

Navigation is a fixed bottom nav bar inside `<Layout>`. The floating `<ChatBubble>` opens `<Chat>`, which calls the client-side Gemini service.

### Key Files

- `src/types.ts` — shared types and small helper functions (`getSaleLabel`, `getPrecioVenta`, `getMargen`, etc.)
- `src/firebase.ts` — initializes Firebase app, exports `auth`, `db`, and `storage` (Firebase Storage for profile photo uploads)
- `src/services/gemini.ts` — **client-side** Gemini wrapper for the in-app chat bubble
- `src/services/scoringService.ts` — credit score algorithm (Colombian 150–950 scale) and all PassportView helpers
- `src/services/pdfService.ts` — generates the business passport PDF with jsPDF + QR code
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)

### Firestore Data Model

Root document `users/{userId}` (ID = Firebase Auth UID):
- Fields: `firstName`, `lastName`, `idNumber`, `phone`, `birthDate`, `createdAt`, `email?`, `photoURL?`
- Bot linking: `telegramChatId?`, `whatsappPhone?`, `linkCode?: { code, expiresAt }`, `verificationCode?: { code, expiresAt }`
- Bot conversation state: `whatsappHistory`, `whatsappPendingState`, `telegramHistory`, `telegramPendingState`, `whatsappLastMsgId` (deduplication)

Subcollections under each user:
- `sales/` — `{ items: SaleItem[], total, createdAt, source }`
- `expenses/` — `{ concept, amount, items?, createdAt, source }`
- `debts/` — `{ name, concept, amount, type ('me-deben'|'debo'), status ('pendiente'|'parcial'|'pagada'), amountPaid?, paidAt?, createdAt }`
- `inventario/` — `{ nombre, cantidad, precioCompra, precioVenta, createdAt, updatedAt? }`
- `scoreHistory/` — `{ score, weekKey, recordedAt }`

The `source` field on sales/expenses tracks where the movement came from: `'manual' | 'chat' | 'telegram' | 'whatsapp' | 'camara'`.

**Important double-entry patterns:**
- `deuda-me-deben` (loan given) → writes to both `debts` AND `expenses` (cash left the business)
- `deuda-debo` (loan received) → writes to both `debts` AND `sales` (cash entered the business)
- `pago-deuda-debo` (paying a debt) → writes to `expenses`
- `cobro-deuda-me-deben` (collecting a debt) → writes to `sales`

Firestore rules (`firestore.rules`): users read/write only their own subtree. `passportVerifications/{code}` is publicly readable. There is also a `fiados` subcollection in the rules — it is legacy/unused; debt tracking was migrated to `debts/`.

Firebase Storage rules (`storage.rules`): profile photos at `users/{userId}/profile.jpg`, auth-required, images only, 5 MB limit.

### Serverless API (Vercel)

`api/` contains Vercel serverless functions (30s max duration per `vercel.json`):
- `api/whatsapp.ts` — WhatsApp Business webhook. GET verifies the webhook token. POST: handles `vincular <code>` for account linking, then routes to `processMessage` (normal) or `handlePendingState` (multi-turn in progress).
- `api/telegram.ts` — Telegram Bot webhook, same architecture as WhatsApp.
- `api/verify.ts` — Passport verification endpoint. GET: publicly returns passport score/name/expiry for a given code (used by `?verificar=CODE` flow). POST: requires Bearer token, writes to `passportVerifications/` with a 90-day expiry.
- `api/_lib/processMessage.ts` — Shared business logic for both bots. Calls Gemini, maps movement types to Firestore writes, handles inventory lookups (fuzzy name match), debt payments, and multi-turn state. Returns a `PendingState` when more input is needed.
- `api/_lib/gemini.ts` — **Server-side** Gemini client with structured JSON output via `responseSchema`.
- `api/_lib/whatsapp-bot.ts` / `api/_lib/telegram-bot.ts` — Thin send helpers.

Firebase Admin SDK init in each serverless function uses a `getApps().length > 0` guard to avoid re-initialization on function reuse (warm starts).

`vercel.json` rewrites all non-API routes (`/((?!api/).*)`) to `/index.html` for SPA routing.

Bot conversation history is trimmed to the last `MAX_HISTORY = 10` entries (5 user→bot turns) via `slice(-MAX_HISTORY)` after each message, stored on the user doc.

**Bot linking flow:** User taps "Vincular bot" in ProfileView → app writes a `linkCode: { code, expiresAt }` to the user doc → user sends `vincular <code>` to the WhatsApp or Telegram bot → webhook looks up the user by code → stores `whatsappPhone` or `telegramChatId` on the user doc. WhatsApp deduplicates messages using `whatsappLastMsgId` stored on the user doc (same message arriving twice is dropped).

**Multi-turn `PendingState`:** When `processMessage` needs more information (e.g., user said "compré arroz" without a price, or a debt payment exceeds what's owed), it returns a `PendingState` saved to `whatsappPendingState` / `telegramPendingState`. The next message routes to `handlePendingState` instead of `processMessage`. Flow types: `compra-nueva` (asks purchase price → whether they sell it → sale price), `compra-existente` (asks whether they sell it → sale price), `deuda-ya-pagada` (asks about new debt), `pago-excede-deuda` (asks to confirm clamped amount). `isAfirmativo` / `isNegativo` helpers in `processMessage.ts` parse yes/no answers.

**Inventory fuzzy matching** (`findInventoryProduct` in `api/_lib/processMessage.ts`): 4-step cascade — exact name match → substring containment → word-level inclusion → Spanish stem + Levenshtein similarity > 0.8. `parseUserPrice` handles Colombian shorthand: "50k" and "50 mil" both parse to 50 000.

### Gemini AI — Two Separate Integrations

**Server-side** (`api/_lib/gemini.ts`): Used by Telegram/WhatsApp bots. Model: `gemini-2.5-flash` (fallback: `gemini-2.0-flash`). Enforces structured JSON via `responseSchema`. Returns `{ message, data?, movements? }` where `data` is the primary `ParsedMovement` and `movements` contains secondary ones for multi-action messages.

**Client-side** (`src/services/gemini.ts`): Used by the in-app chat bubble. Model: `gemini-2.0-flash-exp` (injected via Vite `define`). Expects `{ message, data?: { type, amount, concept } }`.

Movement types: `venta`, `gasto`, `compra`, `deuda-me-deben`, `deuda-debo`, `pago-deuda-debo`, `cobro-deuda-me-deben`.

The server-side system prompt uses a "mirror tone" rule: the bot must match the user's register exactly (Colombian slang, neutral, or formal). It also corrects speech-to-text artifacts common in Colombian Spanish (e.g., "vendí dos" → STT outputs "22" → bot corrects to quantity 2).

### Credit Score (PassportView)

`scoringService.ts` computes a score on the Colombian 150–950 scale from five weighted factors:
- Consistencia de ingresos (0–30): regularity of sales activity
- Capacidad de pago (0–25): income-to-expense margin
- Gestión de fiados (0–20): debt recovery rate and own debt repayment speed
- Salud de inventario (0–15): purchase-to-sales ratio regularity
- Calidad de datos (0–10): activity frequency and description quality

Requires ≥ 5 total records (`hasEnoughData`) before showing a score. `pdfService.ts` uses these results to generate a downloadable business passport PDF.

### Feedback / Third-party

`SuggestionsModal.tsx` sends user feedback via `@emailjs/browser` (public EmailJS credentials, client-side only).

### Styling

- Tailwind CSS v4 via `@tailwindcss/vite` plugin — no `tailwind.config.js`
- Brand colors: gold `#B8860B` / `#FFD700` / `#DAA520`, cream background `#FDFBF0`, dark mode `#0D0D0D` / `#1A1A1A`
- Font: `Be Vietnam Pro` (body), `Plus Jakarta Sans` (headings)
- All view components accept `isDarkMode: boolean` and apply conditional classes via `cn()`
- Animations via `motion/react` (Framer Motion v12) with `AnimatePresence` for tab transitions
