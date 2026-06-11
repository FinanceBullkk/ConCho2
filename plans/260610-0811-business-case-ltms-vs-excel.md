# Business Case — Vì sao nên xây tiếp LTMS nội bộ thay vì Excel/Google Form

> **Loại tài liệu:** Business case 2 tầng (C-level + Trưởng phòng HR/L&D)
> **Ngày:** 2026-06-10 · **Phạm vi:** TMS v2 → Internal LTMS · ~1000 nhân viên · 2–3 Office vật lý
> **Người đọc mục tiêu:** (a) C-level — ngôn ngữ ROI/tài chính/chiến lược nhân sự; (b) Trưởng phòng HR/L&D — ngôn ngữ vận hành (giờ công, độ phủ, tiến độ).
> **Kết luận 1 dòng:** Phần đắt nhất của hệ thống **đã xây xong (~64%)**; chi phí biên để xây tiếp là nhỏ, còn giá trị bị "khoá" trong data đã thu thập thì lớn — **đáng xây tiếp**, và bước tiếp theo hiệu quả nhất là một **dashboard ROI/quản lý 2 tầng dựng trên data sẵn có**.

---

## 0. Bối cảnh & điểm khác biệt quan trọng nhất

Hầu hết business case "Excel vs LMS" giả định ta đang **bắt đầu từ con số 0** và phải chi một khoản lớn. **Trường hợp của ta thì ngược lại:**

| | Tình huống thông thường | Tình huống của chúng ta |
|---|---|---|
| Điểm xuất phát | Chưa có gì, phải build/mua từ đầu | Đã có hệ thống chạy được, **~64% xong** |
| Chi phí lớn nhất | Còn ở phía trước | **Đã chi rồi** (auth, scheduling, attendance, assessment engine, certificate, report, org model, assignment, notification) |
| Câu hỏi cần trả lời | "Có đáng đầu tư không?" | "Có đáng **hoàn tất** + **bộc lộ giá trị đã có** không?" |
| Rủi ro lớn nhất | Build sai, lãng phí | **Bỏ dở** — data đã thu nhưng không ai xem được → giá trị thành nợ |

Đây là **đòn bẩy tài chính trung tâm** của toàn bộ tài liệu: ta không xin tiền để xây một LMS triệu đô; ta xin tiền (rất ít) để **biến tài sản đã có thành giá trị lãnh đạo nhìn thấy được**.

**Lưu ý về động lực giá trị (khác với phần lớn case study LMS):** Tổ chức **không có đào tạo an toàn/tuân thủ bắt buộc**. Vì vậy business case này **không** dùng lập luận "rủi ro pháp lý/audit". Giá trị đặt trên 4 trụ:
1. **Hiệu quả đào tạo** (đo được, cải thiện được).
2. **Hiệu suất vận hành của team L&D** (tiết kiệm giờ công, tự phục vụ, một nguồn dữ liệu).
3. **Phát triển & giữ chân nhân viên** (learning path, internal mobility).
4. **Chứng minh giá trị team L&D với lãnh đạo** (dashboard ROI — biến công việc vô hình thành con số).

---

## 1. TÓM TẮT ROI CHO C-LEVEL (Executive Summary)

### 1.1. Vấn đề kinh doanh
Hiện đào tạo ~1000 nhân viên đang được điều phối bằng **Excel + Google Form**. Cách này **không sai về kỹ thuật**, nhưng nó tạo ra 3 chi phí ẩn mà cấp lãnh đạo không nhìn thấy:
- **Chi phí giờ công hành chính** của team L&D (nhập liệu, ghép file, nhắc deadline thủ công).
- **Chi phí cơ hội**: không đo được hiệu quả đào tạo → không tối ưu được ngân sách đào tạo.
- **Chi phí chiến lược**: không chứng minh được đào tạo ↔ giữ chân/thăng tiến → L&D bị xem là trung tâm chi phí, không phải đòn bẩy giá trị.

### 1.2. Tại sao đây là vấn đề tiền bạc, không chỉ tiện lợi
- **Đào tạo là khoản chi đáng kể.** Benchmark quốc tế: doanh nghiệp chi trung bình **~$1,283/nhân viên/năm** cho học tập tại nơi làm việc (ATD, dữ liệu 2023) và mỗi nhân viên nhận **~47 giờ đào tạo/năm** (Training Magazine, 2024, giảm từ 57 giờ năm 2023). *(Số tuyệt đối ở VN sẽ thấp hơn — **cần xác minh con số nội bộ**, nhưng tỷ lệ giờ/người và cơ cấu chi vẫn là khung tham chiếu hợp lệ.)* Một khoản chi cỡ này **mà không đo được hiệu quả** là rủi ro tài chính, không phải sự tiện nghi.
- **Giữ chân nhân viên là đòn bẩy ROI lớn nhất của L&D.** **94% nhân viên** nói sẽ ở lại lâu hơn nếu công ty đầu tư vào sự nghiệp của họ (LinkedIn). Cung cấp cơ hội học tập là **chiến lược giữ chân số 1** và 90% tổ chức lo ngại về giữ chân (LinkedIn Workplace Learning Report 2024). Doanh nghiệp có **văn hoá học tập mạnh** đạt tỷ lệ giữ chân **57%** và internal mobility **23%** — cao nhất nhóm khảo sát.
- **Chi phí thay thế một nhân viên** rơi vào khoảng **33% lương năm** (mức điển hình), dải rộng **50–200% lương năm** tuỳ vị trí (SHRM). Với 1000 nhân viên, **chỉ cần giảm rời bỏ 1 điểm phần trăm** (≈10 người/năm) là đã bù thừa toàn bộ chi phí xây tiếp hệ thống. *(Mô hình minh hoạ — xem §5.3; cần điền lương trung bình + turnover rate nội bộ.)*

### 1.3. Mô hình ROI tóm tắt (3 dòng giá trị)
| Dòng giá trị | Cơ chế | Bằng chứng / benchmark |
|---|---|---|
| **Hiệu suất vận hành** | Tự động hoá ghi danh, nhắc hạn, báo cáo → giảm giờ hành chính | Quản lý đào tạo giảm từ **15–20h/tuần → 4–6h/tuần** việc hành chính (~**70%**) sau khi dùng LMS; tự động hoá giảm ~**30%** thời gian quản trị *(nguồn vendor — cần xác minh trong môi trường ta)* |
| **Giữ chân & phát triển** | Learning path, chứng chỉ, theo dõi tiến bộ → tăng gắn kết & giữ chân | Career goals → gắn kết học tập **gấp 4 lần**; learning path cá nhân hoá → engagement **+85%** *(nguồn vendor — cần xác minh)*; giữ chân +1 điểm % bù thừa chi phí (§5.3) |
| **Ra quyết định bằng dữ liệu** | Một nguồn dữ liệu + dashboard → tối ưu ngân sách đào tạo | LMS cho phép đo completion/score/feedback theo thời gian thực; Excel thì không (§3) |

### 1.4. Đề nghị với C-level
Phê duyệt **xây tiếp** (không phải mua mới, không phải làm lại). Khoản đầu tư biên cần xin: (1) thời gian kỹ sư để hoàn tất các vòng còn dở + dựng **dashboard ROI 2 tầng**; (2) **hosting always-on trả phí** + giám sát (đang là free-tier, rủi ro vận hành). Đổi lại: trong **vài tuần**, lãnh đạo có một màn hình duy nhất trả lời "Đào tạo đang tạo ra giá trị gì?" — dựng trên **data hệ thống đã thu thập sẵn** (hoàn thành, chứng chỉ, điểm danh, assignment, org). Chi tiết: §7.

---

## 2. GIÁ TRỊ VẬN HÀNH CHO TRƯỞNG PHÒNG HR/L&D

Phần này nói bằng ngôn ngữ vận hành: **giờ công, độ phủ, tiến độ, sai sót**.

### 2.1. Công việc hằng tuần hiện nay (Excel/Form) vs hệ thống
| Tác vụ vận hành | Excel/Google Form hôm nay | LTMS (đã có / sắp có) |
|---|---|---|
| Lên lịch buổi học (course+Office+Room+time+Trainer) | Gõ tay vào sheet, dễ trùng lịch/trùng phòng | Coordinator mở Session, **DB chặn trùng slot** bằng unique index `{classId,startTime}` |
| Đăng ký học viên | Phát Google Form → copy kết quả sang sheet | **Tự phục vụ** qua catalog `/me/catalog` + coordinator gán khi cần |
| Điểm danh | Gọi tên, đánh dấu sheet | Module attendance (mark, edit-window, audit) |
| Quiz/đánh giá | Form rời, chấm tay | **Assessment engine** auto-grade + question bank + chấm tay short-text |
| Cấp chứng chỉ | Làm tay từng cái | Tự cấp khi đủ điều kiện + **verify công khai** + theo dõi **hạn chứng chỉ** |
| Nhắc deadline | Nhắn tin/email thủ công | **Notification engine**: nhắc 7 ngày / 1 ngày / mỗi 3 ngày quá hạn + **digest cho quản lý** |
| Báo cáo hoàn thành | Cuối tháng ghép file, lọc tay | **Completion/Compliance report** + **xuất xlsx** 1 click, rollup theo program/phòng ban |
| Theo dõi ai quá hạn | Lọc tay, dễ sót | Trạng thái dẫn xuất `not_started/in_progress/complete/overdue` tự động |
| Ai quản ai (org) | Cột text tự do | `Department` + `managerId`, **dashboard "My Team"** cho quản lý |

### 2.2. Đòn bẩy giờ công (cốt lõi với trưởng phòng)
Benchmark: trước LMS, quản lý đào tạo dành **15–20 giờ/tuần** cho việc hành chính; sau LMS còn **4–6 giờ/tuần** — tiết kiệm **~11–14 giờ/tuần/người** *(nguồn vendor Docebo/Continu — **cần xác minh** với khối lượng thật của team ta)*. Số giờ này được **tái phân bổ** sang việc có giá trị cao: thiết kế nội dung, làm việc với trainer, phân tích "khoá nào hiệu quả".

**Cách trình bày với sếp:** đây không phải "cắt người" — đây là **chuyển team L&D từ vai trò thư ký nhập liệu sang vai trò cố vấn học tập**.

### 2.3. Độ phủ & tiến độ — thứ Excel không cho thấy theo thời gian thực
- **Độ phủ đào tạo**: % nhân viên đã tham gia ≥1 khoá trong kỳ, theo phòng ban/Office — tính được ngay từ data enrollment/completion.
- **Tiến độ chương trình chiến lược**: bao nhiêu % phòng X đã hoàn tất learning path Y.
- **Backlog**: ai đang chờ gán, ai quá hạn, chứng chỉ nào sắp hết hạn cần tái cấp.

Với Excel, mỗi câu hỏi trên là **một buổi ghép file**. Với hệ thống, là **một lần load trang**.

---

## 3. "EXCEL / GOOGLE FORM KHÔNG LÀM ĐƯỢC GÌ"

Đây không phải chê Excel — Excel xuất sắc cho việc của nó. Vấn đề là **8 việc bản chất** mà bảng tính + form **không thể** làm tốt ở quy mô 1000 người × nhiều Office (tổng hợp từ Bridge, Zensai, TalentLMS, Percify):

1. **Tự động hoá theo sự kiện.** Form không tự nhắc hạn, không tự cấp chứng chỉ khi đủ điều kiện, không tự escalate cho quản lý. Mọi thứ phải có người ngồi làm tay → việc bị sót khi người bận.
2. **Tự phục vụ (self-service).** Học viên không thể tự xem lịch sử học, tự đăng ký khoá đủ điều kiện, tự xem tiến độ learning path. Form chỉ thu một chiều.
3. **Một nguồn dữ liệu duy nhất (single source of truth).** Excel/Form sinh ra **nhiều bản sao** (file tháng 1, file tháng 2, bản của coordinator A, bản của B). Không ai chắc bản nào đúng. LTMS giữ **một bản** có thẩm quyền.
4. **Toàn vẹn & ràng buộc dữ liệu.** Sheet không chặn được **trùng lịch/trùng phòng**, không enforce "1 buổi = 1 giờ", không khoá đăng ký khi chưa đủ tiên quyết. Hệ thống enforce bằng **ràng buộc DB + policy** (vd unique `{classId,startTime}`, prerequisite gating).
5. **Phân quyền & nhật ký kiểm toán.** Form không phân biệt được coordinator được làm gì vs admin; không ghi "ai sửa gì lúc nào". Hệ thống có **2 lớp authz (role + policy)** + **audit log mọi thay đổi** + **soft-delete** (xoá nhầm khôi phục được).
6. **Dashboard thời gian thực.** Excel cho ảnh chụp tĩnh tại thời điểm ghép file. Hệ thống cho **chỉ số sống** (completion/attendance/overdue cập nhật liên tục).
7. **Quy mô 1000 người × nhiều Office.** Bảng tính càng to càng chậm, dễ hỏng công thức, khó cộng tác đồng thời. Hệ thống được thiết kế cho quy mô này.
8. **Lịch sử học của từng người (learning record).** Form không lưu được "hồ sơ học tập trọn đời" của 1 nhân viên (đã học gì, chứng chỉ nào còn hạn, đang ở đâu trong learning path). Đây là **nền tảng cho phát triển nghề nghiệp & internal mobility** — đòn bẩy giữ chân ở §1.

> **Chốt:** Excel quản lý **ô và file**. LTMS quản lý **con người, sự kiện và kết quả theo thời gian**. Ở quy mô 1000 người, khác biệt này là khác biệt giữa "phản ứng" và "điều hành".

---

## 4. GAP TÍNH NĂNG — Ta có gì · Industry có gì · Cái nào quan trọng với ta

Nhóm tính năng LMS/LTMS hiện đại tạo giá trị cho L&D **không-tuân-thủ** (tổng hợp Disprz, SkillsCaravan, Continu, ISG 2025). Cột "Quan trọng với ta?" được chấm theo bối cảnh **offline, coordinator-scheduled, không compliance bắt buộc**.

| Nhóm tính năng | Industry | **Ta đã có?** | Quan trọng với ta? |
|---|---|---|---|
| Lập lịch buổi học + chống trùng | ✓ | ✅ Có (unique index, 5 slot, mode-aware) | ⭐⭐⭐ Lõi vận hành |
| Điểm danh offline | ✓ | ✅ Có | ⭐⭐⭐ Lõi |
| Quiz/đánh giá auto-graded + question bank | ✓ | ✅ Có (`domains/assessment`) | ⭐⭐ Đo hiệu quả (Kirkpatrick L2) |
| Chứng chỉ + verify + hạn/tái cấp | ✓ | ✅ Có (validFrom/validUntil) | ⭐⭐ Phát triển nhân viên |
| Catalog tự đăng ký | ✓ | ✅ Có (`/me/catalog`) | ⭐⭐⭐ Tự phục vụ |
| Giao bài bắt buộc + hạn chót | ✓ | ✅ Có (Assignment + due dates) | ⭐⭐ Đảm bảo độ phủ |
| Learning path + tiên quyết | ✓ | ✅ Có (sequenced paths + progress) | ⭐⭐⭐ Giữ chân/mobility |
| Báo cáo hoàn thành + xuất Excel | ✓ | ✅ Có (rollup + xlsx) | ⭐⭐⭐ Chứng minh giá trị |
| Org model (phòng ban + quản lý) | ✓ | ✅ Có (`Department`+`managerId`, My Team) | ⭐⭐ Báo cáo theo tuyến |
| Notification/escalation | ✓ | ✅ Có (reminder + manager digest) | ⭐⭐ Giảm việc tay |
| **Office vật lý + Room (Office-scoped)** | ✓ (facility mgmt) | 🟡 Đang làm (Wave E3/recenter) | ⭐⭐⭐ **Bắt buộc cho offline 2–3 site** |
| **Trainer nội bộ/thuê ngoài** | ✓ | 🟡 Đang làm (Phase 3 recenter) | ⭐⭐⭐ **Khớp thực tế** |
| **Vai trò Training coordinator (≠ Admin)** | ✓ | 🟡 Đang làm (Phase 1 recenter) | ⭐⭐ Phân quyền đúng người |
| **Dashboard analytics 2 tầng (ops + ROI)** | ✓ (LMS analytics) | 🔴 **Chưa có** (mới có report dạng bảng/xlsx) | ⭐⭐⭐ **Đòn bẩy chứng minh giá trị — xem §7** |
| Skills/competency mapping | ✓ (competency LMS) | 🔴 Chưa | ⭐ Có giá trị, nhưng **giai đoạn sau** |
| Đo hiệu quả Kirkpatrick L3/L4 (behavior/results) | ✓ (learning analytics) | 🔴 Chưa (mới có L1 feedback, L2 assessment) | ⭐⭐ Bước nâng cấp ROI tự nhiên |
| SCORM/xAPI, video hosting, gamification, mobile native | ✓ | ❌ Không (cố ý hoãn) | ☆ **Không** — ngoài phạm vi, đừng đuổi theo |

**Đọc bảng này:** Ta đã có **toàn bộ lõi** mà một LTMS nội bộ cần. Khoảng trống thật sự còn lại **không phải tính năng học tập** mà là (a) **khớp mô hình vận hành thật** (Office/Room/Trainer/Coordinator — đang làm) và (b) **bộc lộ data thành dashboard** (chưa có — và đây là việc rẻ nhất, hiệu quả nhất). Những thứ LMS thương mại "có thêm" (SCORM, marketplace, video, gamification) **ta cố ý không cần** — đó chính là lý do tự xây hợp lý hơn mua (§6).

---

## 5. CHỈ SỐ ROI + DANH SÁCH KPI DASHBOARD 2 TẦNG

### 5.1. Khung đo hiệu quả đào tạo (đặt nền cho ROI)
**Kirkpatrick 4 cấp** (chuẩn ngành) + **Phillips cấp 5 (ROI)**:

| Cấp | Tên | Câu hỏi | Ta đo bằng data nào (đã có / cần thêm) |
|---|---|---|---|
| L1 | **Reaction** | Học viên thấy khoá thế nào? | ✅ **Feedback** module (rating/comment) |
| L2 | **Learning** | Học viên có tiếp thu không? | ✅ **Assessment** pass/score |
| L3 | **Behavior** | Có áp dụng vào việc không? | 🔴 Cần thêm: manager check-in / khảo sát sau 30–60 ngày |
| L4 | **Results** | Tác động tới chỉ số kinh doanh? | 🔴 Cần liên kết KPI nghiệp vụ (năng suất, lỗi, doanh số…) |
| L5 | **ROI** | Lợi ích quy tiền / chi phí? | 🔴 Công thức Phillips (xem 5.2) |

**Thực hành ngành:** dùng Kirkpatrick làm xương sống; chỉ thêm Phillips L5 khi **CFO yêu cầu con số ROI cứng**. Ta nên **đo chắc L1–L2 ngay (đã có data)**, làm L3 bán tự động, và để L4–L5 cho chương trình trọng điểm.

### 5.2. Công thức ROI (Phillips)
```
ROI(%) = (Lợi ích ròng của chương trình / Tổng chi phí chương trình) × 100
       = ((Lợi ích quy tiền − Chi phí) / Chi phí) × 100
```
Lưu ý: L5 đòi hỏi **quy tiền kết quả L4** — chỉ làm cho khoá có tác động đo được. Với phần lớn khoá nội bộ, **dừng ở L1–L3 + chỉ số vận hành** là đủ thuyết phục; ép ROI tiền tệ cho mọi khoá là cái bẫy.

### 5.3. Mô hình ROI minh hoạ (điền số nội bộ để dùng thật)
> ⚠️ **Số dưới là minh hoạ phương pháp, KHÔNG phải số thật** — cần thay bằng dữ liệu nội bộ (lương TB, turnover rate, headcount team L&D). Mọi benchmark đã đánh dấu nguồn.

**Dòng A — Tiết kiệm giờ hành chính (lợi ích vận hành):**
- Giả định team điều phối tiết kiệm ~**10 giờ/tuần/người** nhờ tự động hoá *(dải benchmark 11–14h — cần xác minh)*.
- × số coordinator × 48 tuần × chi phí giờ công nội bộ = **cổ tức hiệu suất/năm**.

**Dòng B — Tránh chi phí rời bỏ (lợi ích chiến lược):**
- 1000 nhân viên × turnover rate hiện tại = số người rời/năm.
- Cải thiện giữ chân **+1 điểm %** ≈ **10 người/năm** ở lại.
- × (33%–50% lương năm chi phí thay thế, SHRM) = **chi phí tránh được/năm**.
- → Thường **chỉ riêng Dòng B đã vượt xa** toàn bộ chi phí xây tiếp + hosting.

**Chi phí (mẫu số):**
- Chi phí kỹ sư xây tiếp (một lần, **nhỏ** vì lõi đã xong) + hosting always-on/năm + bảo trì.
- **Không** có phí license per-seat (khác hẳn mua — §6).

**Cách dùng:** Trình C-level dạng "**ngay cả với giả định bảo thủ nhất** (chỉ tính Dòng A, bỏ qua Dòng B), khoản đầu tư hoàn vốn trong X tháng." Đây là lập luận an toàn vì Dòng A dễ đo, Dòng B là upside.

### 5.4. KPI Dashboard — TẦNG 1: VẬN HÀNH (Trưởng phòng L&D)
*Mục tiêu: điều hành hằng ngày/tuần. Tất cả tính được từ data đã có.*

| # | KPI / Widget | Nguồn data (đã có) |
|---|---|---|
| 1 | **Tỷ lệ hoàn thành** theo program / cohort / phòng ban | completion engine + rollup |
| 2 | **Tỷ lệ điểm danh** theo buổi / khoá / Office | attendance records |
| 3 | **Học viên quá hạn** (đếm + danh sách drill-down) | Assignment derived status `overdue` |
| 4 | **Buổi học**: đã lên lịch / đã diễn ra / sắp tới (theo Office) | Schedule/Session |
| 5 | **Chứng chỉ sắp hết hạn** (cần tái cấp) | Certificate `validUntil` |
| 6 | **Tỷ lệ đậu assessment** + phân bố điểm | assessment attempts |
| 7 | **Điểm feedback TB** theo trainer / khoá | Feedback |
| 8 | **Tự đăng ký vs coordinator gán** (cơ cấu nguồn roster) | enrollment source |
| 9 | **Backlog**: chờ gán / waitlist | enrollment + (waitlist sau E3) |
| 10 | **Độ phủ đào tạo**: % nhân viên ≥1 khoá/kỳ theo phòng ban | enrollment ∪ completion + org |
| 11 | **Sức khoẻ cron/nhắc hạn** (đã gửi bao nhiêu reminder) | NotificationLog + CronRun |
| 12 | **Công suất phòng/Office** (room utilization) | *sau Wave E3 (Room)* |

### 5.5. KPI Dashboard — TẦNG 2: ROI/CHIẾN LƯỢC (C-level)
*Mục tiêu: trả lời "đào tạo tạo ra giá trị gì?". Một số cần thêm liên kết KPI nghiệp vụ.*

| # | KPI / Widget | Nguồn / điều kiện |
|---|---|---|
| 1 | **Chi phí đào tạo/người/năm** (so benchmark ~$1,283 ATD) | chi phí nội bộ + headcount *(cần nhập chi phí)* |
| 2 | **Chi phí mỗi lượt hoàn thành** (cost per completion) | chi phí / số completion |
| 3 | **Độ phủ đào tạo toàn công ty** + theo phòng ban/Office | completion + org |
| 4 | **Hoàn thành chương trình chiến lược** (% theo phòng) | Assignment + completion |
| 5 | **Internal mobility / hoàn tất learning path** (career pathing) | LearningPath progress |
| 6 | **Tương quan đào tạo ↔ giữ chân** (trained vs untrained retention) | cần data theo thời gian + trạng thái nhân sự *(cần xác minh nguồn HR)* |
| 7 | **Cổ tức hiệu suất** (giờ hành chính tiết kiệm quy tiền) | mô hình §5.3 |
| 8 | **Kirkpatrick rollup** L1(feedback)→L2(assessment)→L3(behavior)→L4(results) | L1–L2 đã có; L3–L4 thêm |
| 9 | **Tỷ lệ đậu & điểm TB toàn tổ chức** (xu hướng theo quý) | assessment, time-series |
| 10 | **Chứng chỉ còn hiệu lực / hết hạn** toàn tổ chức (năng lực sẵn sàng) | Certificate state |
| 11 | **ROI% (Phillips)** cho chương trình trọng điểm | chỉ khi đo được L4 |
| 12 | **Skill/competency coverage** | *giai đoạn sau (competency layer)* |

> **Nguyên tắc thiết kế dashboard:** Tầng 1 = **mật độ cao, drill-down, cập nhật liên tục** (công cụ làm việc). Tầng 2 = **ít số, xu hướng, kể chuyện giá trị** (công cụ thuyết phục). Cùng một kho data, hai cách trình bày cho hai người đọc.

---

## 6. BUILD-VS-BUY — Thật lòng (sếp SẼ hỏi "sao không mua?")

### 6.1. Giá mua thực tế ở quy mô 1000 user (có nguồn)
| Sản phẩm | Giá tham chiếu | Ghi chú |
|---|---|---|
| **Docebo** | Enterprise **từ $25,000/năm** (hợp đồng 3 năm); giảm giá theo bậc khi tăng active users | Báo giá theo yêu cầu |
| **Cornerstone** | **€150K–500K/năm** cho 5,000+ user nhu cầu phức tạp | Hạng nặng, dư thừa cho ta |
| **TalentLMS** | Premium **từ 1,000 user**: giá tuỳ chỉnh (custom) | Bậc dưới rẻ nhưng cap user thấp |
| **360Learning** | $8/user/tháng (bậc nhỏ ≤100); enterprise rẻ hơn Docebo ~20–30% | — |
| **Mặt bằng enterprise** | **$2–$5/user/tháng** nhưng thường yêu cầu **tối thiểu 500–1,000 seat + cam kết dài hạn** | → 1000 user × $4 × 12 ≈ **~$48,000/năm** *(minh hoạ)* |
| **Moodle** | Mã nguồn mở (license $0) nhưng tốn hosting + dev + plugin maintenance | "Miễn phí" chỉ ở license |

*(Tất cả giá trên là **per-seat định kỳ, mỗi năm, mãi mãi** — không phải chi một lần.)*

### 6.2. Khi nào NÊN MUA (thành thật)
- Cần **SCORM/xAPI, kho nội dung dựng sẵn, video hosting, marketplace khoá học** → mua rẻ hơn tự xây nhiều.
- Cần **SLA, support 24/7, tuân thủ chứng nhận (SOC2/ISO) sẵn** mà không muốn tự gánh.
- Không có/không muốn duy trì **đội kỹ sư**.
- Mô hình vận hành **chuẩn mực**, không có yêu cầu lạ.

### 6.3. Khi nào NÊN TỰ XÂY (đúng trường hợp của ta)
- **Mô hình vận hành đặc thù**: coordinator-scheduled, offline, **Office vật lý + Room thuộc Office**, **Trainer nội bộ/thuê ngoài**, **vai trò Coordinator ≠ Admin**. Đây chính xác là chỗ LMS đóng gói **bắt ta uốn theo nó**, còn tự xây thì **uốn theo ta** (đã ghi trong ADR `coordinator-scheduled-offline-model.md`).
- **Không cần** phần đắt của LMS thương mại (SCORM, video, marketplace, gamification, multi-tenant, billing) → trả tiền per-seat cho đống tính năng không dùng là lãng phí.
- **Sở hữu dữ liệu & không lock-in**: dữ liệu học tập 1000 người ở DB của ta, không bị giữ con tin bởi vendor, không lo tăng giá/đổi điều khoản/ngừng dịch vụ.
- **Chi phí biên đã đảo chiều**: phần đắt **đã xây xong**. Mua bây giờ nghĩa là **vứt tài sản đã có** + bắt đầu trả per-seat từ đầu.
- **Phép tính nhiều năm**: tự xây = chi phí kỹ sư (giảm dần) + hosting. Mua = **~$25k–$48k+/năm × mãi mãi** *(minh hoạ, cần báo giá thật)*. Qua 3–5 năm, chênh lệch tích luỹ lớn.

### 6.4. Đánh đổi của tự xây (không giấu)
| Rủi ro tự xây | Hiện trạng / giảm thiểu |
|---|---|
| Gánh nặng bảo trì | Có thật. Nhưng codebase đã có **7 cổng CI**, test gate, audit, soft-delete, modular domains — không phải prototype tạm |
| Không có SLA/support vendor | Đúng. Cần **hosting always-on trả phí + Sentry monitor** (đã nằm trong Wave D1, là việc owner) |
| Tự chịu trách nhiệm bảo mật | Đang được giữ nghiêm: CSRF, rate limit, 2 lớp authz, MFA, gitleaks gate, JWT cookie |
| Phụ thuộc người xây | Rủi ro bus-factor. Giảm thiểu bằng docs/specs (`docs/specs/`) + ADR + system map |

> **Tóm tắt build-vs-buy:** Ta **không** nên mua, vì (1) phần đắt đã xây, (2) mô hình vận hành đặc thù mà gói thương mại không khớp, (3) ta cố ý không cần phần đắt của họ, (4) per-seat × 1000 user × nhiều năm > chi phí tự duy trì, (5) sở hữu dữ liệu. Đánh đổi (bảo trì/SLA/bảo mật) là **thật** và được quản trị bằng hosting trả phí + CI + docs. Nếu một ngày phát sinh nhu cầu **kho nội dung e-learning dựng sẵn quy mô lớn**, hãy xét mua **bổ sung** cho đúng mảng đó — không phải thay cả hệ thống.

---

## 7. KHUYẾN NGHỊ — Xây gì TIẾP để chứng minh giá trị nhanh nhất

**Nguyên tắc dẫn đường (từ chính agent contract của repo):** *"Latent value is debt if users cannot click it or reports cannot consume it"* — giá trị tiềm ẩn là nợ nếu không ai bấm xem được. Hệ thống đang **thu rất nhiều data** (completion, certificate, attendance, assessment, feedback, assignment, org) nhưng lãnh đạo **chưa có màn hình** để thấy. Đó là khoản nợ giá trị lớn nhất — và rẻ nhất để trả.

### 7.1. Ưu tiên #1 (khuyến nghị mạnh) — **Dashboard ROI/Quản lý 2 tầng trên data sẵn có**
- **Vì sao:** rẻ nhất (chủ yếu là lớp **tổng hợp + trực quan hoá** trên collection đã có), hiệu quả chứng minh giá trị cao nhất, biến tài sản ẩn thành thứ lãnh đạo bấm xem được.
- **Làm gì:** dựng 2 dashboard ở §5.4 (vận hành) và §5.5 (ROI), tái dùng completion/compliance report engine đã có; bắt đầu bằng các KPI **đã có đủ data** (Tầng 1 gần như trọn vẹn; Tầng 2 các mục 1–5, 7, 9, 10).
- **Kết quả:** trong **vài tuần**, trưởng phòng có công cụ điều hành thời gian thực; C-level có màn hình kể chuyện giá trị. Đây là "**quick win**" thuyết phục để mở khoá đầu tư tiếp.

### 7.2. Ưu tiên #2 — **Hoàn tất khớp mô hình vận hành thật** (đang dở)
Theo plan `260609-2215-ltms-recenter-coordinator-offline/`: **Office + Room (Office-scoped)**, **Trainer nội bộ/thuê ngoài**, **vai trò Training coordinator**, và đưa luồng **coordinator-scheduled thành UX chính**. Đây là điều kiện để hệ thống **thật sự thay thế Excel/Form** cho đào tạo offline đa-Office — đóng các vòng còn hở.

### 7.3. Ưu tiên #3 — **Nâng đo lường lên Kirkpatrick L3** (nửa tự động)
Đã có L1 (feedback) + L2 (assessment). Thêm **khảo sát behavior 30–60 ngày** (manager xác nhận áp dụng) để leo lên L3 — bước này biến dashboard ROI từ "đếm hoạt động" thành "đo tác động", nâng hẳn chất lượng câu chuyện với C-level. L4/L5 (results/ROI tiền tệ) chỉ làm cho **chương trình trọng điểm**.

### 7.4. Hạ tầng nền (việc owner, không phải code) — **Hosting always-on + giám sát**
Wave D1: rời free-tier sang **hosting trả phí always-on** + Sentry cron monitor. Đây là điều kiện để hệ thống đáng tin ở quy mô 1000 người — và là phần "đánh đổi tự xây" cần được cấp ngân sách (nhỏ).

### 7.5. KHÔNG làm (giữ kỷ luật phạm vi)
SCORM/xAPI, video hosting, gamification, mobile native, multi-tenant, billing, competency mapping nâng cao — **hoãn** trừ khi có yêu cầu cụ thể. Đuổi theo bề rộng LMS thương mại là cách chắc chắn nhất để **không bao giờ đóng được vòng giá trị hiện tại**.

### 7.6. Lộ trình đề xuất (thứ tự đóng giá trị nhanh)
```
1. Dashboard 2 tầng trên data sẵn có      → quick win, chứng minh giá trị  (ưu tiên cao nhất)
2. Hoàn tất Office/Room/Trainer/Coordinator → thay thế Excel cho offline đa-Office
3. Kirkpatrick L3 (behavior survey)        → nâng câu chuyện ROI từ "hoạt động" → "tác động"
4. (Owner) Hosting always-on + monitor     → độ tin cậy quy mô 1000 người
5. (Sau, nếu cần) Competency/L4-L5         → chỉ cho chương trình trọng điểm
```

---

## 8. Nguồn trích dẫn

**Benchmark chi/giờ đào tạo:**
- [2024 Training Industry Report — Training Magazine](https://trainingmag.com/2024-training-industry-report/) (47 giờ/người/năm 2024; $98B chi tiêu Mỹ)
- [Workplace training spending per employee 2024 — Statista](https://www.statista.com/statistics/738519/workplace-training-spending-per-employee/)
- [ATD State of the Industry — HRTech Edge tóm tắt](https://hrtechedge.com/2024-state-of-the-industry-report-workplace-learning-spending-increases-and-key-insights/) ($1,283/nhân viên 2023)

**Giá LMS / build-vs-buy:**
- [Docebo Pricing & Plans — Vendr](https://www.vendr.com/marketplace/docebo) (từ $25,000/năm)
- [LMS Pricing — 360Learning](https://360learning.com/blog/lms-pricing/)
- [LMS Pricing 2026 — Educate-me](https://www.educate-me.co/blog/lms-pricing) ($2–$5/user enterprise, min 500–1000 seat; Cornerstone €150K–500K)

**Đo ROI đào tạo (Kirkpatrick / Phillips):**
- [Kirkpatrick Model — Valamis](https://www.valamis.com/hub/kirkpatrick-model)
- [Phillips ROI Model: 5 Levels — Whatfix](https://whatfix.com/blog/phillips-roi-model/) (ROI% = lợi ích ròng / chi phí × 100)
- [Phillips Model — HCM Deck](https://hcmdeck.com/en/blog/the-fifth-level-of-the-new-kirkpatrick-model-or-why-and-how-to-calculate-training-roi/)

**LMS vs Excel / tự động hoá / giờ tiết kiệm:**
- [LMS vs Manual Spreadsheet — Bridge](https://www.getbridge.com/blog/lms/bridge-lms-vs-manual-process-spreadsheet-comparison/)
- [Why not to track training in Excel — Zensai](https://zensai.com/articles/how-to-track-employee-training-in-excel/)
- [Reduce LMS Administration Time — Docebo](https://www.docebo.com/learning-network/blog/how-to-reduce-lms-administration-time/) (15–20h→4–6h/tuần)
- [LMS Automations — Continu](https://www.continu.com/blog/lms-automations)

**Giữ chân / phát triển / turnover:**
- [Workplace Learning Report 2024 — LinkedIn (PDF)](https://learning.linkedin.com/content/dam/me/business/en-us/amp/learning-solutions/images/wlr-2024/LinkedIn-Workplace-Learning-Report-2024.pdf) (học tập = chiến lược giữ chân #1; văn hoá học mạnh → giữ chân 57%, mobility 23%; career goals → engage 4×)
- [94% nhân viên ở lại nếu được đầu tư sự nghiệp — CNBC/LinkedIn](https://www.cnbc.com/2019/02/27/94percent-of-employees-would-stay-at-a-company-for-this-one-reason.html)
- [Cost to Replace an Employee 50–200% lương — SHRM/Waterfall](https://waterfallplanning.com/learn/the-real-cost-of-employee-turnover/)

**Tính năng LMS hiện đại:**
- [Competency Training LMS 2025 — Disprz](https://disprz.ai/blog/competency-training-lms-boost-skills)
- [15 Must-Have LMS Features — Continu](https://www.continu.com/blog/lms-features) (learning path cá nhân hoá → engagement +85%)

**Nội bộ (ground hệ thống):**
- `docs/lms-roadmap.md`, `docs/development-roadmap.md` (trạng thái ~64%, Wave A–E)
- `docs/decisions/coordinator-scheduled-offline-model.md` (ADR mô hình vận hành thật)
- `server/CONTEXT.md` (glossary Office/Trainer/Coordinator)
- `plans/260609-2215-ltms-recenter-coordinator-offline/` (plan re-center)

---

## 9. Câu hỏi chưa giải quyết (cần input để dùng số thật)

1. **Số nội bộ cho mô hình ROI (§5.3):** lương trung bình, tỷ lệ rời bỏ (turnover) hiện tại, headcount + chi phí giờ công team L&D/coordinator, ngân sách đào tạo hiện tại/năm. *(Không có thì dashboard ROI Tầng 2 chỉ chạy được phần "đếm", chưa quy ra tiền.)*
2. **Benchmark VN:** số chi/giờ đào tạo của doanh nghiệp VN cùng quy mô — để thay benchmark Mỹ ($1,283/47h) cho thuyết phục hơn. *(Cần xác minh — chưa tìm nguồn VN trong vòng research này.)*
3. **Số giờ hành chính thật của team** trước khi tự động hoá — để khẳng định "cổ tức hiệu suất" thay vì dùng dải vendor 15–20h. *(Cần đo nội bộ.)*
4. **Nguồn data giữ chân:** trạng thái nghỉ việc của nhân viên có truy được từ HR system để tính tương quan "trained vs untrained retention" (KPI Tầng 2 #6) không?
5. **L4 results:** chương trình nào có KPI nghiệp vụ đo được (năng suất/lỗi/doanh số) để thử Phillips L5 — hay tạm dừng ở L1–L3?
6. **Quyết định owner đang chặn:** Google OAuth app + Workspace domain (SSO), ngân sách hosting always-on — cả hai nằm trong Track A của plan re-center.
