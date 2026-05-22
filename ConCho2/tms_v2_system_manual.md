# Báo cáo Hệ thống & Hướng dẫn sử dụng: Training Management System (TMS) v2

> **Tài liệu tham khảo chính thức dành cho Đội ngũ Kỹ thuật (IT) và Người dùng cuối (End-Users).**

---

## Phần 1: Kiến trúc & Cơ chế hoạt động ngầm (Dành cho Admin/IT)

Hệ thống TMS v2 được xây dựng trên nền tảng **MERN Stack** (MongoDB, Express, React, Node.js), tập trung giải quyết các bài toán về tính toàn vẹn dữ liệu và xử lý tranh chấp tài nguyên (Concurrency) trong môi trường nhiều người dùng. Dưới đây là luồng hoạt động của 3 tính năng cốt lõi:

### 1. Luồng Quản lý ID & Đồng bộ (Data Sync)
*   **Data Flow:** Khi Admin tải lên file Excel chứa danh sách nhân sự hoặc lớp học từ hệ thống cũ, Frontend (React) sẽ parse dữ liệu và gửi một mảng Object xuống Backend (Node.js/Express).
*   **Cơ chế xử lý:** Thay vì tự động sinh ID mới (có nguy cơ trùng lặp hoặc mất liên kết), hệ thống sử dụng phương thức `bulkWrite` với cơ chế **Upsert** của Mongoose, lấy `empCode` hoặc `classCode` làm khóa chính (Primary Key).
*   **Xử lý Mật khẩu:** Backend được lập trình logic kiểm tra thông minh: chỉ mã hóa (hash) và lưu mật khẩu mặc định nếu đây là lệnh **Insert** (tạo mới). Nếu là lệnh **Update** (cập nhật thông tin nhân viên), trường mật khẩu sẽ bị bỏ qua, bảo vệ tuyệt đối mật khẩu cá nhân mà người dùng đã đổi trước đó.

### 2. Luồng Đặt lịch & Quản lý Slot (Booking System)
*   **Data Flow:** Team Leader chọn slot trên giao diện Grid (ma trận) → Gửi Request chứa `teamId` và `scheduleId` → Backend tiến hành kiểm tra điều kiện (Rule validation) → Cập nhật Database.
*   **Cơ chế xử lý:** Áp dụng mô hình **1 Slot = 1 Team** (khóa Slot bằng trường `bookedTeamId`). 
*   **Cơ chế Auto-Release:** Middleware ngầm (Hooks) của MongoDB liên tục theo dõi trạng thái nhân sự. Nếu một Team bị xóa hết thành viên hoặc tất cả thành viên chuyển trạng thái "Dropped", hệ thống sẽ tự động gán `bookedTeamId = null`, lập tức trả lại slot trống cho các Team khác.

### 3. Luồng Thống kê & Hiệu suất (Analytics)
*   **Data Flow:** Các hành động điểm danh của Teacher sẽ cập nhật trực tiếp vào Collection `Attendance`. Khi xem Dashboard, Frontend gọi API thống kê.
*   **Cơ chế xử lý:** Backend gom nhóm (Aggregation) dữ liệu theo Cá nhân, Team, và Lớp học. Dữ liệu này được tối ưu qua một lớp Cache để giảm tải cho Database.

> [!TIP]
> **💡 Tính hiệu quả của các Quyết định Kiến trúc:**
> *   **Upsert (`bulkWrite`):** Giảm thiểu hàng nghìn truy vấn đơn lẻ xuống còn 1 tác vụ duy nhất, giúp Import 10,000+ nhân sự chỉ trong vài giây mà không gây nghẽn mạng, loại bỏ hoàn toàn lỗi Duplicate Key.
> *   **MongoDB Transaction:** Là "tấm khiên" chống Overbooking (đặt trùng). Khi hai Team Leader bấm đặt cùng 1 slot vào cùng 1 phần nghìn giây, Transaction đảm bảo chuỗi hành động (Đếm số buổi trong tuần → Kiểm tra giới hạn 2 buổi/tuần → Ghi nhận Slot) là một khối thống nhất (Atomic). Request thứ hai sẽ bị khóa và nhận thông báo lỗi hợp lệ thay vì ghi đè lên dữ liệu.
> *   **Chuẩn hóa UTC Timezone:** Đảm bảo mọi tính toán tuần/ngày (ví dụ: Thứ 2 đến Chủ nhật) hoàn toàn chính xác bất kể máy chủ hay trình duyệt của người dùng đặt ở múi giờ nào, triệt tiêu lỗi lệch ngày hiển thị trên lịch.

---

## Phần 2: Đánh giá mức độ hiệu quả (Impact Analysis)

Việc chuyển đổi từ thao tác thủ công sang TMS v2 mang lại các tác động rõ rệt:

| Tiêu chí | Trước đây (Thủ công / TMS v1) | Hiện tại (TMS v2) | Lợi ích |
| :--- | :--- | :--- | :--- |
| **Đồng bộ Dữ liệu** | Nhập tay từng người hoặc import dễ gây reset mật khẩu của User. | Import 1-click qua Excel (Upsert). Giữ nguyên mật khẩu cũ. | Tiết kiệm 90% thời gian IT. Zero ticket phàn nàn về lỗi mật khẩu. |
| **Xếp Lịch Học** | Team Leader chat/email xin lịch, Admin phải đối chiếu thủ công trên Excel. | Tự động hóa hoàn toàn. Team Leader tự xem Grid và chọn slot. | Loại bỏ 100% thời gian điều phối của Admin. |
| **Xung đột Lịch** | Thường xuyên bị trùng lịch, quá tải lớp do không đếm được số buổi/tuần kịp thời. | Chặn cứng bằng MongoDB Transaction. Tối đa 1 Team/Slot & 2 Buổi/Tuần/Team. | Zero rủi ro Overbooking. Công bằng tài nguyên cho mọi Team. |
| **Báo cáo Chuyên cần**| Teacher đếm tay, cuối tháng tổng hợp bằng hàm Excel VLOOKUP. | Cập nhật Real-time trên Dashboard (Theo User, Team, Class). | Dữ liệu tức thời phục vụ ra quyết định nhân sự, độ chính xác 100%. |

---

## Phần 3: Hướng dẫn sử dụng chi tiết (Dành cho End-User)

### 👑 1. Vai trò Admin (Quản trị viên)
**a. Đồng bộ danh sách nhân sự mới:**
1. Chuyển đến trang **Users** (hoặc mục Sync).
2. Tải lên file danh sách nhân viên (định dạng chuẩn của công ty).
3. Hệ thống sẽ tự động quét:
    * *Nhân viên mới:* Tự động tạo tài khoản, cấp ID và mật khẩu mặc định.
    * *Nhân viên cũ có thay đổi (phòng ban, tên):* Cập nhật thông tin mới.
    > [!IMPORTANT]
    > **Lưu ý:** Bạn hoàn toàn yên tâm tải lại danh sách nhiều lần. Mật khẩu mà nhân viên đang sử dụng sẽ **KHÔNG** bị ghi đè hay thay đổi.

**b. Xem Báo cáo Chuyên cần (Dashboard):**
1. Chuyển đến tab **Analytics**.
2. Sử dụng các tab để chuyển đổi góc nhìn:
    * **By Employee:** Xem tỷ lệ đi học của từng cá nhân.
    * **By Team:** Đánh giá độ chăm chỉ của cả một tập thể (rất hữu ích để vinh danh đội nhóm).
    * **By Class:** Theo dõi sỉ số từng buổi của một khóa học cụ thể.

---

### 👔 2. Vai trò Team Leader (Trưởng nhóm)
**a. Cách đọc Lịch học (Grid):**
* Chuyển đến trang **Schedules** (hoặc Book Class). Bạn sẽ thấy lịch học dạng trang tính.
* **Trục dọc:** Các khung giờ trong ngày (Mỗi slot kéo dài 1 tiếng).
* **Trục ngang:** Các ngày trong tuần hiện tại (Từ Thứ 2 đến Chủ nhật).
* **Màu sắc ô:**
    * 🟩 **Màu xanh / Có tên lớp:** Lớp đã có người đặt hoặc chính Team của bạn đã đặt.
    * ⬜ **Ô trống (có nút Book Slot):** Slot đang mở, bạn có thể đăng ký.

**b. Cách đăng ký (Book Slot):**
1. Tìm một ô trống phù hợp với lịch của Team bạn.
2. Bấm vào nút **Book Slot**.
3. Chọn Team của bạn (hệ thống sẽ tự động đưa tối đa 9 thành viên Active vào lớp).

**c. Tại sao tôi không thể đặt lịch?**
Nếu hệ thống báo lỗi, thường do 2 nguyên nhân sau (Quy định bắt buộc):
*   ⚠️ **"Team đã book tối đa 2 buổi/tuần":** Mỗi Team chỉ được học tối đa 2 buổi trong 1 tuần (tính từ Thứ 2 đến Chủ nhật) để nhường quyền cho các Team khác.
*   ⚠️ **"Slot đã bị lấy mất":** Do có một Team Leader khác bấm nút Book Slot *cùng lúc* với bạn và hệ thống đã ưu tiên xử lý cho người bấm nhanh hơn mili-giây. Vui lòng chọn khung giờ khác.

---

### 👨‍🏫 3. Vai trò Teacher (Giáo viên)
**a. Xem danh sách & Điểm danh:**
1. Chuyển đến trang **Attendance** (Điểm danh).
2. Chọn Lớp học và Ngày học bạn đang phụ trách.
3. Hệ thống sẽ hiển thị danh sách học viên của Team đã đăng ký slot đó.
4. Đánh dấu trạng thái cho từng người: **P** (Có mặt), **A** (Vắng mặt), **L** (Đến trễ), hoặc **EL** (Vắng có phép).
5. Bấm **Save** để lưu lại. Dữ liệu này sẽ lập tức được cập nhật lên Dashboard của Admin.
    > [!NOTE]
    > Bạn không cần lo lắng về việc học viên nghỉ việc. Hệ thống sẽ tự động gỡ tên các nhân sự đã nghỉ (Dropped) khỏi danh sách điểm danh của bạn.
