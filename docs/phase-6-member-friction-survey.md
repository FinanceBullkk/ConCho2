# Phase 6 Blocker · Member & Leader UI Language Friction Survey

**Mục đích:** Validate inference từ Phase 5 i18n discovery doc §C — Participants (Member + Leader) có thực sự thấy English UI là barrier không.

**Format:** Async survey · 5 câu hỏi · ~2-3 phút điền · neutral phrasing (không leading).

**Channel suggest:** Google Forms (anonymous) hoặc Slack poll. Anonymous tốt hơn vì giảm social desirability bias (user sẽ thừa nhận confusion thật).

**Audience:** Tất cả Members + Leaders đã từng login TMS trong 30 ngày gần nhất. Không khảo sát Admin (đã VN comfortable per inference) và PIC (sample size có thể quá nhỏ).

**Decision rule:** Nếu ≥30% Member/Leader trả lời "có gặp lúng túng" ở Q4 → confirm Path A · proceed Phase 6 implementation. Nếu <15% → reconsider Path B (rẻ hơn 4×). 15-30% → trigger 3-4 interview follow-up.

---

## Copy-paste vào Google Forms

> **Title:** Khảo sát ngắn về giao diện TMS
>
> **Description:**
> Chào bạn! Đây là khảo sát ngắn (5 câu · ~3 phút) về trải nghiệm dùng phần mềm TMS. Mục đích là cải thiện ngôn ngữ hiển thị cho phù hợp hơn. Câu trả lời ẩn danh — không lưu danh tính của bạn.

---

### Câu 1 — Tần suất sử dụng

> Bạn vào TMS trung bình bao lâu một lần?

- [ ] Hằng ngày
- [ ] 2-3 lần / tuần
- [ ] 1 lần / tuần
- [ ] Ít hơn 1 lần / tuần
- [ ] Hiếm khi (chỉ khi có việc bắt buộc)

---

### Câu 2 — Vai trò

> Vai trò của bạn trong TMS là gì? *(chọn vai trò bạn dùng nhiều nhất)*

- [ ] Member (học viên / thành viên nhóm)
- [ ] Leader (trưởng nhóm / điều phối)
- [ ] Khác

---

### Câu 3 — Mức độ thoải mái với tiếng Anh

> Khi nhìn vào các nút và thông báo bằng tiếng Anh trong TMS (ví dụ: "Sign In", "Book", "Submit", "Cancel"), bạn cảm thấy thế nào?

- [ ] Hiểu ngay, không cần suy nghĩ
- [ ] Hiểu được nhưng phải dừng lại một chút
- [ ] Phải đoán hoặc nhìn icon đi kèm để hiểu
- [ ] Thường không chắc, đôi khi phải hỏi đồng nghiệp
- [ ] Khó hiểu, thường click thử để biết nút làm gì

---

### Câu 4 — Khoảnh khắc lúng túng cụ thể *(quan trọng nhất)*

> Đã bao giờ bạn **dừng lại** hoặc **click sai** vì không hiểu một từ tiếng Anh trong TMS chưa? *(có thể chọn nhiều)*

- [ ] Chưa từng
- [ ] Có — ở màn hình đăng nhập / quên mật khẩu
- [ ] Có — ở trang Lịch / Đặt lớp (Calendar / Book)
- [ ] Có — ở trang Điểm danh (Attendance)
- [ ] Có — ở trang Lớp học / Nhóm (Classes / Teams)
- [ ] Có — ở thông báo lỗi / popup
- [ ] Có — ở chỗ khác (mô tả ở Câu 5)

---

### Câu 5 — Góp ý mở *(không bắt buộc)*

> Có từ / nút / câu thông báo nào trong TMS mà bạn nghĩ nên dịch sang tiếng Việt không? Hoặc bất cứ phản hồi nào về ngôn ngữ giao diện?

*(text area · không bắt buộc · giới hạn ~300 ký tự)*

---

## Analysis plan

Sau khi đóng survey (đề xuất 7 ngày mở):

| Question | Metric | Threshold |
|---|---|---|
| Q1 | Tỷ lệ "Hằng ngày" + "2-3 lần/tuần" | Định dạng audience — heavy users vs occasional |
| Q2 | Member vs Leader split | Để segment analysis nếu sample lớn |
| Q3 | % trả lời "Phải đoán" + "Thường không chắc" + "Khó hiểu" | **Combined ≥ 40% = strong signal cho Path A** |
| Q4 | % trả lời bất kỳ "Có —" option | **≥ 30% = confirm Path A · < 15% = reconsider Path B** |
| Q5 | Open-coded themes (word cloud / categorize) | Identify highest-friction screens cho ưu tiên S1/S2 |

Distribution:
- Send via email blast hoặc Slack tới Members + Leaders
- Reminder 1× sau 3 ngày
- Đóng sau 7 ngày
- Target sample: ≥ 20 responses (Member/Leader combined)

---

## Notes

- **Tại sao 5 câu?** Async surveys với >7 câu drop completion rate >40%. 5 câu fit trong 1 màn hình mobile.
- **Tại sao anonymous?** Power asymmetry — Members có thể ngại admit "không hiểu tiếng Anh" nếu có tên hiển thị.
- **Tại sao không hỏi "Bạn muốn UI tiếng Việt hay tiếng Anh?"** — Leading question. Câu trả lời sẽ bị bias bởi politeness. Q3+Q4 đo behavior + friction thực, không opinion.
- **Tại sao không khảo sát Admin?** Inference đã strong (daily user · internal team · VN seed data); Admin opinion về Member-friction là proxy, không phải primary signal.
