# Phase 5 — i18n Migration Discovery & Recommendation

**Format:** discovery / research
**Scope:** desk research only (per Phase 5 Brief Q3 lock)
**Output:** go/no-go + plan if go
**Date:** May 2026
**Status:** **SUPERSEDED (2026-06-04).** This discovery recommended Path A
(standardize to Vietnamese, single-locale, no i18n library). The product later
went the **opposite** direction: it is now **English-only** — a single `en`
locale via `i18next` + `t()`, `vi.json` deleted, language detector/toggle
removed (see `docs/development-roadmap.md` Wave C1, 2026-06-04). Keep this file
for decision history only; do **not** action its Vietnamese-canonical
recommendation.

---

**Original status (historical):** DECIDED · Path A · VN canonical (sign-off 2026-05-20)

> TMS đã có VN+EN copy trộn lẫn xuyên suốt 4 phase. Mỗi phase đều defer quyết định i18n sang chính nó "discovery cycle". Đây là cycle đó. Output: **recommendation only** · không code · kết thúc bằng Phase 6 ticket draft (hoặc lý do "no-migration").

---

## 0 · TL;DR + Recommendation

> **Đề xuất: standardize sang Vietnamese (single-locale) — KHÔNG đưa multi-locale i18n framework vào.**
>
> TMS là internal training tool cho công ty Việt Nam. Toàn bộ user đều đọc tiếng Việt là native. "Vấn đề i18n" thực ra không phải thiếu hạ tầng dịch — mà là codebase trôi dạt sang EN defaults vì shadcn/Tailwind boilerplate ship EN. Giải pháp: chọn VN làm UI language canonical, convert ~80-120 VN strings hiện có thành nhất quán + convert phần EN còn lại theo lịch ưu tiên. Không thêm i18n library. Không build translation pipeline. **Một nguồn duy nhất, không runtime locale switcher, không JSON message catalogs.**

**Cost ước tính:** 2-3 sprint · ~700-850 EN strings cần xét (thực tế convert ~400-500 user-facing strings) · ~15-20 file · ~400-500 LOC delta. Không thêm dependency, không thay đổi schema, ít backend work (~30 user-facing message keys).

**Nếu team không đồng ý và muốn true multi-locale (EN + VN switcher):** xem §D-F cho path đó. Cost: 4-6 sprint · thêm `react-i18next` · setup message catalogs · ~700 strings phải extract · maintenance dịch thuật liên tục. Không recommend trừ khi TMS mở rộng cho user không đọc được VN.

---

## A · Context · how we got here

TMS tồn tại trong một trạng thái khác thường: *internal app*, *Vietnamese company*, *UI phần lớn bằng English*. Đây không phải quyết định có chủ đích — đây là kết quả của 4 thừa hưởng (inheritances):

1. **shadcn / Tailwind boilerplate** ship EN khắp nơi ("Sign In", "Update password", "Cancel"). Mỗi dev khi tạo page mới đều thừa hưởng EN defaults.
2. **Vietnamese được patch in** ở nơi dev cảm thấy quan trọng cho user: error messages ("Mật khẩu không khớp"), critical confirms ("Đổi mật khẩu bắt buộc"), domain-specific labels ("Đang học", "Đã hoàn thành").
3. **Phase 0-4 không quyết định**: mỗi phase đều explicit non-goal i18n migration. Consistency drift tích lũy.
4. **Hai pattern coexist**: Auth (LoginPage, Forgot, Reset, UserSettings) thiên về EN; ForceChangePasswordModal là "VN island" trong EN App.jsx; PasswordStrength có `labels` prop sẵn sàng cho cả hai locale.

> Phase 4 Brief §C ghi rõ: "*No i18n migration. Mixed VN+EN remains. Decision deferred to its own discovery cycle.*" Tài liệu này chính là cycle đó.

---

## B · Surface inventory (verified against codebase, May 2026)

Audit grep-based qua toàn bộ `client/src/pages/*.jsx` + key components.

**Phân bố:**

- **EN dominant: ~88%** — 22/25 page files
- **Mixed (cả VN+EN trong cùng file): ~12%** — 3 files
- **VN dominant: 0** ở page level (chỉ có ForceChangePasswordModal embed trong App.jsx)

> Đây là phát hiện quan trọng: bản nháp ban đầu (Claude Design tool) ước tính TeamsPage và EvaluationPage là VN/Mixed. **Audit thực tế cho thấy cả hai đều EN dominant** rồi. Codebase **sạch hơn** so với assumption, nhưng cũng **EN-leaning nặng hơn**.

### Per-file classification

| File / component | Locale | Notes |
|---|---|---|
| `LoginPage` · `ForgotPasswordPage` · `ResetPasswordPage` · `UserSettingsPage` · `App.AuthExpiredModal` | EN | Auth shell · Phase 3 Screen 7 + Phase 4 Surface 10 đã set EN vocabulary |
| `App.ForceChangePasswordModal` | **VN** | VN island trong EN App.jsx · "Đổi mật khẩu bắt buộc" · ~20 strings |
| `DashboardPage` · `ParticipantDashboard` | EN | Phase 3 Screen 3 + 6 · EN throughout |
| `CalendarPage` · `SchedulesPage` · `AttendancePage` | EN | Phase 3 Screens 1 + 2 · EN |
| `BookClassPage` | **Mixed** | Phần lớn EN; có VN guard message "Chưa thuộc nhóm nào" |
| `ClassDetailPage` · `ClassesPage` (NewCohortModal) | EN | EN throughout |
| `ClassesPage` (EditClassModal section) | **Mixed** | EditClassModal có VN ("✏️ Chỉnh sửa lớp", "Trạng thái", "Tổng số buổi") |
| `UsersPage` · `PeoplePage` · `ProgramsPage` | EN | EN clean |
| `TeamsPage` | EN | EN clean ("Team Name", "Assigned Class", "Team Leader") — **đã chuyển từ VN từ commit nào đó** |
| `EvaluationPage` | EN | Score concepts (Grammar, Vocabulary, Pronunciation, Fluency) EN |
| `ReportsPage` · `HRExportPage` · `ReconcilePage` | EN | EN clean |
| `AttendanceDashboardPage` | **Mixed** | HR Export confirm dialog VN ("Xuất Dữ Liệu Điểm Danh", "Có {n} bản ghi mới"); headers EN |
| `SystemPage` · `SettingsPage` · `DatabaseExplorer` | EN | EN clean (Surface 9 cleanup đã apply) |
| `SyncPage` | EN | Plain EN |

### Approximate string count by locale

- **EN strings**: ~700-850 (toàn bộ auth, dashboard, calendar, reports, system, primitives)
- **VN strings**: ~80-120 (concentrated:
  - ForceChangePasswordModal ~20 strings
  - AttendanceDashboardPage HR Export confirm ~15 strings
  - ClassesPage EditClassModal ~12 strings
  - PasswordStrength VN labels override ~5 strings
  - Server response error messages ~30 strings)
- **Mixed-locale files**: 3 trong tổng ~25 page files (BookClassPage, ClassesPage, AttendanceDashboardPage)

Code-style strings (button labels, headers, validation, toast) khoảng 70-80% nằm trong component `jsx`, 20-30% trong server response messages. Server messages hiển thị qua `err.response?.data?.message` — locale của chúng = whatever backend write.

### i18n-ready primitive đã tồn tại

`client/src/components/PasswordStrength.jsx` **đã có `labels` prop** cho phép parent override locale:

```jsx
// PasswordStrength.jsx:57
export function PasswordStrength({ value, labels = DEFAULT_LABELS, className })
// DEFAULT_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong']

// App.jsx ForceChangePasswordModal sử dụng VN:
const FORCE_CHANGE_LABELS_VN = ['', 'Yếu', 'Trung bình', 'Tốt', 'Mạnh']
<PasswordStrength value={newPwd} labels={FORCE_CHANGE_LABELS_VN} />
```

Pattern này = primitive ngầm hiểu rằng có 2 locale tồn tại, **không cần i18n framework để hỗ trợ**. Cùng pattern có thể áp dụng cho StatusBadge, EmptyState, FilterBar nếu Path A go.

---

## C · Audience analysis (inferred · per Q3 lock)

Per Phase 5 Brief Q3 lock: desk research only. Không có interview. Suy luận dưới đây từ codebase signals (data, naming, copy domain) — nên validate với team nếu migration tiến hành.

| User | Inferred locale need | Evidence trong codebase |
|---|---|---|
| **Admin** | VN comfortable · EN tolerable | Internal Vietnamese company · admin role · daily use · VN seed data ("Hà", "N. Hà" trong code comments) |
| **Teacher (PIC)** | VN preferred · varied EN comfort | TMS PICs = Person In Charge (không phải teacher per terminology) · attendance/calendar surfaces EN · không có VN cluster nào pointing to teacher UX |
| **Participant (Member)** | VN strongly preferred | Participants = company employees · ít khả năng tech-fluent · Phase 3 Screen 6 không address gap này |
| **Participant (Leader)** | VN preferred | Same as above · thêm booking UX nơi copy clarity quan trọng |

> **Inference, không phải data.** Không có interview, signal mạnh nhất là: *các dev viết app này là Vietnamese, họ chose để translate ở nơi họ nghĩ matters (errors, critical confirms, frequent labels) và leave English ở nơi inherited từ libraries*. Đó là pattern trong code. Câu hỏi gap có được felt bởi actual users hay không — chỉ answerable bằng talking to them.

Argument mạnh nhất cho VN-canonical: **Participant Member** là lowest-frequency, lowest-tech user · họ bear highest cost của English UI · họ có least power để push back · needs của họ dễ nhất bị overlook.

---

## D · Library landscape (if multi-locale goes ahead)

3 mainstream React i18n libraries. Comparing cho TMS size (~700-850 strings, single team, no external translators).

### react-intl (FormatJS) — ~50kb gzipped

**Pros**: ICU MessageFormat (rich plurals, gender, dates) · stable, well-documented · built-in `FormattedDate`/`FormattedNumber`.

**Cons**: Largest bundle · HOC-heavy API verbose · overkill cho 2-locale app.

### i18next + react-i18next — ~25kb gzipped · modular [**PICKED if Path C**]

**Pros**: Most ecosystem · simple `t('key')` API · works với JSON catalogs hoặc namespaced files · standard Vietnamese-tech-team choice.

**Cons**: Two packages phải coordinate · plural rules separate từ ICU.

### lingui — ~15kb gzipped (smallest)

**Pros**: Compiled message catalogs · macros catch missing translations tại build time · inline `<Trans>` JSX-friendly.

**Cons**: Babel macro · build complexity · smaller ecosystem · learning curve.

**Verdict**: Nếu multi-locale → **i18next**. Largest community · simplest mental model · Vietnamese dev team gần như chắc chắn đã có exposure. Lingui có bundle wins nhưng build setup không worth cho 2-locale internal app.

**Nhưng signal mạnh nhất là: đừng pick cái nào trong số này.** Single-locale rewrite rẻ hơn và remove permanent maintenance burden.

---

## E · Migration strategies · 3 paths

### Path A · VN canonical [**RECOMMENDED**]

Standardize sang Vietnamese. Convert all remaining EN sang VN qua 2-3 sprints. Không i18n library. Single source of truth trong component `jsx`. Tận dụng `labels` prop pattern đã có (PasswordStrength) cho primitives còn lại nếu cần.

- **Cost**: ~400-500 user-facing string changes (target EN → VN)
- **Sprint**: 2-3 sprints · ~400-500 LOC delta
- **Maintenance**: zero ongoing
- **Dep**: none
- **Bundle**: -0kb

### Path B · EN canonical [alternate]

Standardize sang English. Convert remaining VN (~80-120 strings) sang EN. Same shape as Path A nhưng inverse direction.

- **Cost**: ~80-120 string changes (target VN → EN)
- **Sprint**: 1 sprint · ~100-150 LOC delta
- **Maintenance**: zero ongoing
- **Dep**: none
- **Bundle**: -0kb
- **Risk**: Participant Member friction · vi phạm "user cost asymmetry" principle

### Path C · Multi-locale [overkill]

i18next + JSON catalogs. Extract all ~700-850 strings sang `vi.json` + `en.json`. Add locale switcher trong /me/settings. Persist qua `localStorage` hoặc user preference.

- **Cost**: ~750 string extractions + 1500 translations (both ways)
- **Sprint**: 4-6 sprints · ~2000 LOC delta
- **Maintenance**: mỗi string mới cần cả 2 translations · QA burden
- **Dep**: +i18next +react-i18next (~25kb)
- **Bundle**: +25kb gzipped
- **Risk**: under-maintained second locale (industry standard outcome)

### Why VN over EN (within Path A vs B)

1. **User cost asymmetry**: Vietnamese-only user **không thể** đọc EN UI. EN-comfortable VN user **có thể** đọc VN UI. Optimize cho floor case.
2. **Critical paths đã là VN**: Force-password-change, attendance HR export confirm, edit class — đây là moments nơi errors compound. Codebase hiện tại đã trust VN cho mấy chỗ này.
3. **Domain vocabulary**: "Đang học", "Đã hoàn thành", "Vắng có lý do" đã là canonical terms trong code + DB enum names. Keeping VN aligns UI với data model.
4. **EN canonical fights the data**: DB có Vietnamese names, comments, employee codes formatted Vietnamese-style — UI shifting sang EN tạo translation layer thực ra không thực sự EN.
5. **Codebase EN-heavier than assumed**: Audit cho thấy ~88% EN, không phải 60% như assumption ban đầu. Path B (convert ~80-120 VN → EN) **rẻ hơn nhiều** so với Path A (~400-500 EN → VN) — nhưng đây là điểm mà cost asymmetry analysis trở nên quan trọng nhất: việc rẻ hơn không có nghĩa là correct cho user.

---

## F · Cost & timing breakdown

### Path A (recommended) — VN canonical

| Task | Files | LOC | Sprint |
|---|---|---|---|
| LoginPage → VN | 1 | ~25 | S1 |
| ForgotPassword + ResetPassword → VN | 2 | ~25 | S1 |
| UserSettings → VN | 1 | ~40 | S1 |
| DashboardPage + ParticipantDashboard → VN | 2 | ~60 | S1 |
| CalendarPage + SchedulesPage + AttendancePage → VN | 3 | ~70 | S2 |
| BookClassPage (already mixed) → VN consolidate | 1 | ~25 | S2 |
| ClassDetailPage + ClassesPage NewCohortModal → VN | 2 | ~50 | S2 |
| UsersPage + PeoplePage + ProgramsPage → VN | 3 | ~50 | S2 |
| TeamsPage + EvaluationPage → VN | 2 | ~60 | S2 |
| ReportsPage + HRExportPage + ReconcilePage → VN | 3 | ~50 | S3 |
| AttendanceDashboardPage (already mixed) → VN consolidate | 1 | ~20 | S3 |
| SystemPage + SettingsPage + DatabaseExplorer → VN | 3 | ~60 | S3 |
| SyncPage → VN | 1 | ~25 | S3 |
| Primitives ambient strings (StatusBadge tones, EmptyState defaults, FilterBar placeholders) → VN (via `labels` prop pattern) | 5-8 | ~40 | S3 |
| Server message keys → VN (small) | ~10 files | ~40 | S3 (server) |
| **Total** | | **~640 LOC delta** | **~3 sprints** |

> **Per-surface PR pattern** — one PR per file group · regression smoke against Phase 3-4 anchors · visual diff. Quality-first matches Phase 4 working style.

### Path B — EN canonical

| Task | Files | LOC | Sprint |
|---|---|---|---|
| ForceChangePasswordModal → EN | App.jsx | ~30 | S1 |
| AttendanceDashboardPage HR Export confirm → EN | 1 | ~25 | S1 |
| ClassesPage EditClassModal → EN | 1 | ~25 | S1 |
| BookClassPage guard message → EN | 1 | ~5 | S1 |
| PasswordStrength default labels (already EN, audit only) | 0 | 0 | — |
| Server message keys → EN | ~10 files | ~40 | S1 (server) |
| **Total** | | **~125 LOC delta** | **~1 sprint** |

### Path C (overkill) — Multi-locale

Skipping detailed table — không recommended. Sketch:

- Setup: `react-i18next` · catalog structure · namespacing · ~1 sprint
- Extract: ~750 strings sang `vi.json` · ~3 sprints (one full pass)
- Translate: ~750 English equivalents sang `en.json` · ~1 sprint (hoặc pay translator)
- Switcher: locale selector + persistence + RTL-readiness for future · ~0.5 sprint
- QA: every screen × 2 locales · ~0.5 sprint
- **Total**: ~6 sprints · estimate climbs if any locale catches edge cases (number/date format · ARIA labels · etc.)

---

## G · Risks

| Risk | Probability | Mitigation |
|---|---|---|
| Devs trong team prefer EN identifiers · code review friction với VN UI strings | Medium | VN chỉ trong string literals · all identifiers + variable names stay EN · cùng pattern như ForceChangePasswordModal hôm nay |
| Vietnamese diacritics break layout ở edge cases | Low | Phase 0 §05 verified Inter renders diacritics fully · no fallback needed |
| String length differences (VN often longer) overflow tight components | Medium | Visual QA per screen during migration · CSS đã dùng flex/auto sizing · primitives tested ở Phase 1 |
| Future external users / partners cần EN | Low | Nếu/khi điều này becomes real, switch sang Path C · cost là real nhưng deferable |
| Server message responses stay EN · UI strings VN · mismatch | High | Server PR converts **~76 user-facing messages** sang VN (audit thực tế · ~6-8 hour task · larger than initial ~30 estimate) — see [docs/phase-6-server-message-audit.md](phase-6-server-message-audit.md) |
| Path A "feels" như undoing work | Medium | Frame as: codebase cuối cùng matches user audience · technical debt resolution · không phải do-over |
| Existing E2E tests reference EN button labels ("Sign In", "Update password") | High | Audit test fixtures · update labels trong cùng PR per surface · ~2 hour task per file |
| **Audit revealed codebase MORE EN-heavy than assumed (~88% vs 60%)** | New | Path A scope tăng từ "~390 LOC" → "~640 LOC" · vẫn manageable trong 3 sprint · không thay đổi recommendation nhưng update timeline |

---

## H · Decision & next steps

> **Recommendation: Path A · standardize sang Vietnamese · 3 sprints (revised lên từ 2 sau audit) · no i18n library.**
>
> Frame as Phase 6 candidate · plan a kickoff với team để validate inference (Audience §C) trước khi commit sprints. Nếu team interviews shift signals, Path B hoặc C có thể trở thành đúng — nhưng Path A là cheapest, most reversible direction.

### Open questions cho team review

1. **Validate audience inference**: Members / Leaders có thực sự thấy EN UI là barrier? Quick survey (5 questions, async) hoặc 3-4 informal interviews · 1 day of work
2. **Confirm dev team posture**: devs có comfortable viết VN string literals không? Nếu pushback, Path B trở thành preferable (và **rẻ hơn nhiều** — chỉ 1 sprint vs 3)
3. **Server message scope**: ai own backend copy decisions? Cần same-direction commitment cho ~30 user-facing message strings
4. **Identifier policy**: confirm "VN strings, EN identifiers" là pattern thống nhất (vs full-VN code style — unusual but exists)

### Phase 6 ticket draft

Nếu decision = Path A, file ticket:

```
Title: Phase 6 — i18n consolidation · VN canonical

Per Phase 5 i18n discovery doc:
- Standardize TMS UI on Vietnamese (Path A)
- Convert ~400-500 user-facing EN strings → VN across ~20 files
- ~640 LOC delta · ~3 sprints (revised up from 2 after audit)
- No new dependencies · no i18n framework
- Per-surface PRs · regression smoke + visual diff
- Re-use existing `labels` prop pattern (PasswordStrength) cho primitives

Blockers (recommended pre-work):
1. 5-question async survey để validate Member/Leader EN-friction
2. Dev-team confirmation on VN string literal pattern
3. Server-side: ~30 user-facing message strings → VN

Sequence:
- S1: Auth + Dashboard (LoginPage · UserSettings · Forgot · Reset · Dashboard ×2)
- S2: Domain pages (Calendar · Schedules · Attendance · ClassDetail · Classes · Users · People · Programs · Teams · Evaluation · BookClass)
- S3: Reports + System + primitives + server messages
- S4: Buffer · QA · E2E test fixture updates

Out of scope:
- Multi-locale framework (deferred indefinitely)
- Backend translation (handled per-string trong cùng sprint)
- Date/number locale formatting (Vietnamese là default trong Intl)
- RTL support
- Domain enum renames (Active/Completed trong DB stays EN)
```

### Nếu team rejects Path A

- **→ Path B (EN canonical)**: 1-sprint job · invert direction · 4× cheaper than Path A · update Phase 6 ticket draft accordingly. Trade-off: gánh nặng "cost asymmetry" — Members có thể không đọc được EN UI.
- **→ Path C (multi-locale)**: schedule separate kickoff · scope 3× larger · needs PM + dev capacity commitment
- **→ Status quo (no migration)**: file rationale trong CLAUDE.md · accept ongoing drift · revisit khi complaint signal appears

---

## Sign-off

**DECIDED 2026-05-20: `Path A go` — VN canonical · 3 sprints · no i18n library.**

Next actions:

1. Phase 6 ticket draft (see §H above) — accepted, ready để track trong issue tracker hoặc inline trong Phase 6 brief khi nó được kick off
2. 3 blockers cần kickoff trước khi commit sprints:
   - 5-question async survey để validate Member/Leader EN-friction → draft tại [docs/phase-6-member-friction-survey.md](phase-6-member-friction-survey.md)
   - Dev-team confirmation on "VN strings, EN identifiers" pattern
   - Server-side scope: **~76 user-facing message keys** (revised từ ~30 sau audit · 2.5× lớn hơn estimate) → concrete list tại [docs/phase-6-server-message-audit.md](phase-6-server-message-audit.md)

> **Phase 5 progress**: 2/2 deliverables done · Surface 12 (SyncPage dedup) designed · i18n discovery done · **Path A accepted** · ready cho phase close.

---

**Refs:**

- Phase 5 Brief (design bundle: `Phase 5 - Brief.html`)
- Phase 0 type decisions (design bundle: `Phase 0 - Decisions.html`)
- Phase 4 Brief §C — i18n explicit non-goal
- `client/src/components/PasswordStrength.jsx` — existing `labels` prop precedent
- `client/src/App.jsx` ForceChangePasswordModal — VN island reference impl
