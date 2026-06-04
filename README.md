<p align="center">
  <img src="https://img.shields.io/badge/Stack-MERN-00d8ff?style=for-the-badge&logo=mongodb&logoColor=white" alt="MERN Stack"/>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black" alt="React 19"/>
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB"/>
  <img src="https://img.shields.io/badge/Tests-241%2B-brightgreen?style=for-the-badge" alt="Tests"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License"/>
</p>

<h1 align="center">TMS v2 — Internal Training Management System (→ LTMS)</h1>

<p align="center">
  <strong>Hệ thống quản lý đào tạo nội bộ (~1000 nhân viên) — thay thế hoàn toàn Excel và Google Sheets.</strong><br/>
  Xếp lịch · Điểm danh · Đánh giá · Hoàn thành · Chứng chỉ · Audit · Báo cáo HR — tất cả trong một nơi.
</p>

---

## Mục lục

1. [TMS là gì, và tại sao cần nó?](#1-tms-là-gì-và-tại-sao-cần-nó)
2. [Ai dùng, làm được gì?](#2-ai-dùng-làm-được-gì)
3. [Tính năng chi tiết](#3-tính-năng-chi-tiết)
4. [Hướng dẫn sử dụng theo vai trò](#4-hướng-dẫn-sử-dụng-theo-vai-trò)
5. [Bảo mật — hệ thống được bảo vệ như thế nào?](#5-bảo-mật--hệ-thống-được-bảo-vệ-như-thế-nào)
6. [Cài đặt & Triển khai](#6-cài-đặt--triển-khai)
7. [Vận hành hằng ngày](#7-vận-hành-hằng-ngày)
8. [Kiến trúc kỹ thuật (dành cho developer)](#8-kiến-trúc-kỹ-thuật-dành-cho-developer)
9. [Testing & Chất lượng](#9-testing--chất-lượng)
10. [Xử lý sự cố thường gặp](#10-xử-lý-sự-cố-thường-gặp)
11. [Tài liệu liên quan](#11-tài-liệu-liên-quan)
12. [Lịch sử phát triển](#12-lịch-sử-phát-triển)

---

## 1. TMS là gì, và tại sao cần nó?

TMS v2 là **ứng dụng web nội bộ** quản lý toàn bộ quy trình **đào tạo nội bộ** của doanh nghiệp (~1000 nhân viên) — xếp lịch, điểm danh, đánh giá, hoàn thành, chứng chỉ, audit và báo cáo HR. Khởi đầu từ quản lý lớp tiếng Anh, hệ thống đang chuyển thành **Internal LTMS** (Learning/Training Management System) đa loại chương trình — onboarding, compliance, kỹ năng mềm, kỹ thuật… — tập trung vào **vận hành đào tạo + tuân thủ (compliance)**, không phải LMS thương mại hay nền tảng nội dung SCORM. Định hướng chi tiết: [`docs/lms-roadmap.md`](docs/lms-roadmap.md) và [`docs/ltms-gap-analysis.md`](docs/ltms-gap-analysis.md).

### Vấn đề trước khi có TMS

| Trước đây | Với TMS |
|-----------|---------|
| Lịch học nằm rải rác trên nhiều file Excel, dễ xung đột | Một hệ thống duy nhất, tất cả nhìn thấy cùng dữ liệu theo thời gian thực |
| Điểm danh thủ công trên giấy hoặc sheet, dễ nhầm | Điểm danh cả lớp trong vài cú click, có lưu lịch sử |
| Không biết ai học đều, ai hay nghỉ | Dashboard tự động theo phòng ban, cấp độ, khóa học |
| Không có Google Calendar — học viên hay quên lịch | Hệ thống tự tạo Google Calendar invite + Meet link gửi đến từng người |
| Password yếu, không có 2FA | Mã hóa bcrypt + xác thực 2 bước (TOTP) + tự động khóa khi đăng nhập sai nhiều lần |
| Không biết ai đã sửa gì trong hệ thống | Mọi thao tác đều được ghi lại tự động (audit log), xem được ai làm gì, lúc nào |

### Lợi ích thực tế

- **Tiết kiệm ~80% công sức nhập liệu** cho HR/L&D mỗi tháng
- **Báo cáo có ngay** — không cần đợi tổng hợp Excel cuối tháng
- **Không mất dữ liệu** — mọi thứ được sao lưu tự động, xóa nhầm vẫn khôi phục được
- **Tự phát hiện lỗi** — hệ thống tự kiểm tra dữ liệu mỗi đêm, báo cáo nếu có bất thường

---

## 2. Ai dùng, làm được gì?

Hệ thống có **3 vai trò** với quyền hạn riêng biệt. Mỗi người chỉ thấy và làm được những gì phù hợp với công việc của mình.

> **Tại sao phân quyền chặt chẽ?**
> Tránh trường hợp học viên vô tình (hoặc cố ý) xóa lịch của người khác, hoặc xem điểm số của đồng nghiệp. Mỗi role chỉ thấy đúng phần mình cần.

| Vai trò | Dành cho | Có thể làm |
|---------|----------|------------|
| **Admin** | HR, L&D Manager | Toàn quyền: quản lý nhân viên, lớp học, nhóm, lịch dạy; xuất báo cáo; cấu hình hệ thống |
| **Teacher** | Giáo viên | Xem lịch dạy, điểm danh học viên, chấm điểm đánh giá cuối khóa |
| **Participant** | Học viên (nhân viên đi học) | Xem lịch học của nhóm mình, đặt slot học (nếu là trưởng nhóm), xem điểm cá nhân |

---

## 3. Tính năng chi tiết

### 3.1. Quản lý người dùng

- Thêm, sửa, xóa nhân viên với đầy đủ thông tin: mã NV, tên, email, phòng ban, cấp độ đầu vào/hiện tại
- **6 trạng thái** phản ánh thực tế: Đang hoạt động / Tạm ngưng / Đã nghỉ / Đã chuyển / Đang chờ / Chờ xếp lớp
- **Xóa an toàn** — nhân viên bị xóa sẽ vào "thùng rác", có thể khôi phục lại nếu lỡ tay xóa nhầm

  > **Tại sao không xóa vĩnh viễn?** Dữ liệu điểm danh và đánh giá cũ vẫn cần được giữ lại cho báo cáo. Xóa vĩnh viễn sẽ làm mất lịch sử.

- **Import hàng loạt từ Excel** — upload danh sách nhân viên một lần, hệ thống tự kiểm tra trùng mã NV và định dạng email
- **Tự động xóa khỏi lịch học** — khi nhân viên chuyển sang trạng thái "Đã nghỉ", hệ thống tự xóa họ khỏi tất cả các buổi học trong tương lai (đồng bộ toàn bộ, không bỏ sót)

  > **Tại sao cần tự động?** Nếu làm thủ công, rất dễ quên một buổi nào đó — người đã nghỉ vẫn hiện trong danh sách điểm danh, gây nhầm lẫn cho giáo viên.

### 3.2. Quản lý lớp học

- Mỗi lớp có mã lớp (ví dụ: `EL001`), tên khóa học, tổng số buổi, trạng thái (Đang học / Đã hoàn thành)
- Tên khóa học chỉ được chọn trong danh sách đã định sẵn (Foundation, Communication 1–3, Business English...) — tránh typo, dữ liệu báo cáo nhất quán
- Số buổi tự động điền theo khóa học

### 3.3. Quản lý nhóm học

- Mỗi nhóm gắn với đúng một lớp học
- Mỗi nhóm có một **trưởng nhóm** — người chịu trách nhiệm đặt lịch cho cả nhóm
- **Chuyển học viên sang nhóm khác** trong một thao tác duy nhất: hệ thống tự cập nhật cả hai nhóm, lịch học cũ và mới, rồi gửi email thông báo cho học viên

  > **Tại sao làm trong một thao tác?** Nếu làm từng bước riêng lẻ (xóa khỏi nhóm A, thêm vào nhóm B, sửa lịch...) mà bị lỗi giữa chừng, dữ liệu sẽ ở trạng thái dở dang — người vừa bị xóa khỏi nhóm A nhưng chưa vào nhóm B. Hệ thống thực hiện toàn bộ hoặc không làm gì cả.

### 3.4. Đặt lịch học (do trưởng nhóm tự tạo)

Đây là tính năng trung tâm của hệ thống.

> **Điểm quan trọng cần hiểu:** Lịch học **KHÔNG** do admin tạo trước rồi nhóm vào book. Mà ngược lại — **trưởng nhóm tự tạo lịch** bằng cách click vào ô trống trên lưới thời gian. Hệ thống tự sinh buổi học tại thời điểm đó và đăng ký toàn bộ nhóm vào.
>
> **Tại sao thiết kế như vậy?** Admin không cần biết trước nhóm nào sẽ học giờ nào — quá nhiều việc theo dõi. Để trưởng nhóm tự chọn giờ phù hợp với cả team thì linh hoạt và tự nhiên hơn. Admin chỉ cần đảm bảo: lớp đã tạo, nhóm đã gán đúng lớp, và đặt giới hạn khung giờ — phần còn lại nhóm tự lo.

**Quy tắc lịch học:**
- Mỗi buổi học kéo dài đúng **1 tiếng**
- Chỉ được học trong **5 khung giờ cố định**: 10:00–11:00 · 11:00–12:00 · 13:00–14:00 · 14:00–15:00 · 15:00–16:00

  > **Tại sao giới hạn khung giờ?** Để tránh các trường hợp như đặt lịch 10:30 hay buổi 1,5 tiếng không theo chuẩn. Khung giờ cố định giúp lịch nhất quán, dễ kiểm soát xung đột.

- Mỗi nhóm tối đa **2 buổi/tuần**

**Cách tạo lịch (dành cho trưởng nhóm):**
1. Mở trang **Đặt lịch** (`/book`) — hiện lưới 7 ngày × 5 khung giờ
2. Ô **trắng** = còn trống, có thể tạo · Ô **có màu** = đã bị nhóm khác chiếm (không thể chọn)
3. Click ô trống → xác nhận → hệ thống tạo buổi học mới · cả nhóm tự động được đăng ký
4. Mỗi thành viên nhận email xác nhận + Google Calendar invite tự động

  > **Tại sao trưởng nhóm cần thấy slot của nhóm khác?** Để biết giờ nào còn trống mà chọn, tránh cố gắng tạo vào giờ đã bị chiếm. Nếu ẩn thông tin này, trưởng nhóm sẽ bị báo lỗi mà không hiểu lý do.

- **Chống đặt trùng** — hai trưởng nhóm cùng click một ô trong cùng một giây? Database có ràng buộc duy nhất `{lớp, giờ bắt đầu}` — chỉ một request thành công, request còn lại nhận thông báo "Slot đã bị chiếm, vui lòng chọn slot khác".
- **Nhắc nhở tự động** — email nhắc lịch học gửi trước 24 giờ
- **Hủy lịch** — trưởng nhóm có thể hủy buổi học, thành viên tự động nhận email thông báo
- **Admin chỉnh sửa nếu cần** — admin có toàn quyền chỉnh sửa hoặc xóa lịch đã tạo (ví dụ khi cần dời lịch hộ nhóm)

### 3.5. Điểm danh

- 4 trạng thái: **Có mặt (P)** / **Vắng (A)** / **Đi trễ (L)** / **Vắng có phép (EL)**
- Điểm danh cả lớp trong **một lần submit** — không cần làm từng người
- Giao diện **lịch tuần** — giáo viên thấy ngay buổi nào đã điểm danh, buổi nào còn thiếu, buổi nào quá hạn
- Ô màu đỏ nhấp nháy = buổi đã qua nhưng chưa điểm danh — cần xử lý ngay

### 3.6. Đánh giá cuối khóa

- Chấm 4 kỹ năng: Ngữ pháp · Từ vựng · Phát âm · Lưu loát — thang điểm 0–10
- Điểm trung bình tự động tính
- Giáo viên có thể ghi thêm nhận xét tự do
- Chấm lại sẽ ghi đè kết quả cũ (không tạo bản trùng)

### 3.7. Báo cáo & Xuất dữ liệu

- **Xuất Excel điểm danh** — file đầy đủ theo khoảng ngày, sẵn sàng nộp HR
- **Xuất Excel đánh giá** — điểm 4 kỹ năng + trung bình + nhận xét theo lớp
- **Đánh dấu đã xuất** — hệ thống tự ghi nhận record nào đã được xuất, tránh xuất trùng
- **Dashboard phân tích**:
  - Tỷ lệ đi học theo khóa học / phòng ban / cấp độ
  - Danh sách học viên chuyên cần nhất và hay vắng nhất

### 3.8. Audit Log — Nhật ký hệ thống

Mọi thao tác tạo/sửa/xóa đều được ghi lại tự động:
- **Ai** làm (mã NV, vai trò)
- **Làm gì** (tạo, sửa, xóa, đăng nhập...)
- **Trên dữ liệu nào** (user nào, lịch nào...)
- **Lúc nào** (thời gian chính xác)
- **Thay đổi cụ thể** (giá trị trước → sau)

> **Tại sao cần audit log?** Khi có sự cố ("ai xóa lịch của tôi?", "ai sửa điểm?"), admin có thể tra cứu ngay. Đây cũng là yêu cầu bắt buộc của nhiều chuẩn kiểm toán nội bộ.

Lưu trữ 2 năm, sau đó tự động xóa.

### 3.9. Tự kiểm tra dữ liệu (Reconciliation)

Hệ thống **tự chạy kiểm tra mỗi đêm lúc 02:00** để phát hiện các bất thường:

| Kiểm tra | Ý nghĩa |
|----------|---------|
| Buổi học đã qua nhưng chưa điểm danh | Nhắc giáo viên bổ sung |
| Học viên trong lịch nhưng không còn trong nhóm | Dữ liệu không đồng bộ |
| Nhân viên đã nghỉ vẫn còn trong nhóm | Cần dọn dẹp |
| Buổi học tương lai không có ai đăng ký | Lịch trống, cần xem lại |
| Nhân viên active nhưng không thuộc nhóm nào | Chưa được xếp lớp |

Kết quả lưu lại 30 ngày để so sánh xu hướng.

---

## 4. Hướng dẫn sử dụng theo vai trò

### 4.1. Đăng nhập lần đầu

1. Mở trình duyệt → vào địa chỉ hệ thống (ví dụ: `https://concho2.onrender.com`)
2. Nhập **Mã nhân viên** (6 số, ví dụ `000123`) và **Mật khẩu** do Admin cấp
3. Nhấn **Đăng nhập**
4. **Lần đầu tiên:** hệ thống yêu cầu đổi mật khẩu mặc định ngay — không thể bỏ qua bước này

   > **Tại sao bắt buộc đổi mật khẩu lần đầu?** Mật khẩu mặc định (`admin12345`) giống nhau cho tất cả tài khoản mới — nếu không đổi, bất kỳ ai biết cũng có thể đăng nhập.

5. Nếu tài khoản bạn bắt buộc dùng **xác thực 2 bước (2FA)**:
   - Tải app **Google Authenticator** hoặc **Microsoft Authenticator** về điện thoại
   - Quét mã QR hiện trên màn hình
   - Nhập 6 số trong app để xác nhận
   - **Lưu lại 10 mã dự phòng** — chỉ hiện một lần duy nhất, dùng khi mất điện thoại

**Quên mật khẩu?**
1. Click **"Quên mật khẩu?"** ở trang đăng nhập
2. Nhập mã nhân viên → Gửi
3. Kiểm tra email công ty → Click link trong email (hết hạn sau 1 giờ)
4. Đặt mật khẩu mới (ít nhất 10 ký tự)

---

### 4.2. Admin — Quy trình hằng tháng

#### Thiết lập lần đầu (chỉ làm 1 lần)

1. Vào **Admin → Cài đặt hệ thống**: kiểm tra 5 khung giờ mặc định (10–11, 11–12, 13–14, 14–15, 15–16). Thay đổi nếu tổ chức dùng giờ khác.
2. Kiểm tra danh sách khóa học và số buổi tương ứng
3. **Import danh sách nhân viên** từ Excel (Academy → Người dùng → Import)

#### Quy trình mỗi khóa học mới

> **Lưu ý quan trọng:** Admin **chỉ tạo lớp và nhóm** — không tạo lịch học trước. Lịch học do **trưởng nhóm tự tạo** khi book slot trên giao diện. Đây là khác biệt cốt lõi so với các hệ thống đặt lịch truyền thống.

```
Bước 1 → Tạo lớp (Academy → Lớp học → Tạo mới)
         Nhập mã lớp, chọn khóa học, hệ thống tự điền số buổi

Bước 2 → Tạo nhóm và gán vào lớp (Academy → Nhóm → Tạo mới)
         Gắn nhóm với lớp (1 nhóm = 1 lớp), chọn trưởng nhóm, thêm thành viên

Bước 3 → Thông báo cho trưởng nhóm tự book lịch
         Họ vào "Đặt lịch" (/book), thấy lưới 7 ngày × 5 khung giờ
         Click ô trống → buổi học được tạo + cả nhóm tự động đăng ký
         (Admin có thể chỉnh sửa hoặc dời lịch sau khi nhóm đã tạo nếu cần)

Bước 4 → Theo dõi
         Dashboard → xem tỷ lệ đi học theo tuần/tháng

Bước 5 → Cuối khóa: Xuất báo cáo (Báo cáo → HR Export → Tải Excel)
```

#### Vận hành hằng ngày

- **Trang chủ (Dashboard)** — tỷ lệ đi học theo phòng ban, cảnh báo bất thường
- **Admin → Nhật ký** — kiểm tra ai làm gì gần đây nếu có thắc mắc
- **Admin → Kiểm tra dữ liệu** — chạy thủ công nếu nghi ngờ có sai sót
- **Academy → Người dùng (đã xóa)** — xem thùng rác, khôi phục nếu xóa nhầm

---

### 4.3. Teacher — Quy trình điểm danh

1. Đăng nhập → **Operations → Điểm danh**
2. Lịch tuần hiển thị tất cả buổi học:
   - 🟢 Đã điểm danh đầy đủ
   - 🟡 Chưa điểm danh
   - 🔴 **Quá hạn** — buổi đã qua, chưa mark — cần xử lý ngay
3. Click vào buổi học → danh sách học viên hiện ra
4. Click **P / A / L / EL** cho từng người (hoặc "Đánh dấu tất cả P" để nhanh hơn)
5. Ghi chú nếu cần → **Lưu**

**Cuối khóa — Chấm điểm:**
1. **Operations → Đánh giá** → chọn lớp
2. Nhập điểm 4 kỹ năng (0–10) cho từng học viên + nhận xét
3. Điểm trung bình tự tính

---

### 4.4. Participant (Học viên) — Đặt lịch học

> Chỉ **trưởng nhóm** mới có quyền đặt lịch. Thành viên thường chỉ xem.

1. Đăng nhập → **Đặt lịch** (`/book`)
2. Lưới lịch tuần hiện ra:
   - Ô **trắng** = còn trống, có thể đặt
   - Ô **có màu** = đã bị nhóm khác đặt rồi, không thể chọn
3. Click ô trống → xem thông tin buổi học → **Xác nhận đặt lịch**
4. Cả nhóm tự động nhận email xác nhận + Google Calendar invite
5. Để hủy: click vào buổi đã đặt → **Hủy lịch** (cả nhóm nhận email thông báo)

**Giới hạn:** tối đa 2 buổi/tuần/nhóm.

---

### 4.5. Mọi người dùng — Quản lý tài khoản cá nhân

Vào **Cài đặt tài khoản** (góc trên phải màn hình):
- **Đổi mật khẩu** — yêu cầu nhập mật khẩu hiện tại, mật khẩu mới ít nhất 10 ký tự
- **Bật xác thực 2 bước (2FA)** — tăng bảo mật tài khoản
- **Đổi giao diện** — tối / sáng (nhớ qua các lần đăng nhập)

---

## 5. Bảo mật — hệ thống được bảo vệ như thế nào?

Đây là phần giải thích **từng lớp bảo vệ** theo ngôn ngữ dễ hiểu — quan trọng để hiểu tại sao hệ thống thiết kế theo cách này.

### 5.1. Mật khẩu

- **Không lưu mật khẩu gốc** — chỉ lưu "dấu vân tay" của mật khẩu (bcrypt hash, 12 rounds). Ngay cả developer xem database cũng không biết mật khẩu của bạn là gì.
- **Tối thiểu 10 ký tự** — đủ để chống brute-force thực tế
- **Tự động khóa** sau 5 lần đăng nhập sai trong 15 phút — chống dò mật khẩu tự động

### 5.2. Phiên đăng nhập (Session)

- Token xác thực được lưu trong **cookie ẩn** — JavaScript không đọc được, phần mềm độc hại không lấy được
- Token hết hạn sau **24 giờ** — phải đăng nhập lại
- Khi đổi mật khẩu → **tất cả phiên cũ bị hủy ngay lập tức**, kể cả trên thiết bị khác

  > **Tại sao quan trọng?** Nếu máy tính bị mất hoặc ai đó đang dùng tài khoản của bạn, đổi mật khẩu là đủ để "đá" họ ra ngay.

### 5.3. Xác thực 2 bước (2FA / MFA)

- Dùng chuẩn **TOTP** (Time-based One-Time Password) — cùng công nghệ với Google/Facebook
- Mỗi mã 6 số chỉ dùng được trong 30 giây, sau đó vô hiệu
- **10 mã dự phòng** cho trường hợp mất điện thoại — mỗi mã dùng được đúng 1 lần

### 5.4. Phân quyền chặt chẽ

- **Phía máy chủ** kiểm tra quyền hạn mọi request — không thể "hack" bằng cách sửa code phía trình duyệt
- **Phía giao diện** ẩn nút bấm với người không có quyền — không thể thấy nút "Xóa user" nếu không phải Admin
- **Hai lớp kiểm tra** đảm bảo dù giao diện bị vượt qua, server vẫn từ chối

### 5.5. Giới hạn tốc độ (Rate Limiting)

Mỗi hành động có số lần giới hạn để chống tấn công tự động:

| Hành động | Giới hạn |
|-----------|---------|
| Đăng nhập sai | 5 lần / 15 phút / IP |
| Quên mật khẩu | 5 yêu cầu / 15 phút |
| Đặt lịch | 10 lần / phút |
| Xuất báo cáo | 10 lần / giờ |
| Toàn bộ API | 200 request / phút / IP |

### 5.6. Bảo vệ chống giả mạo (CSRF)

Mỗi request thay đổi dữ liệu (tạo, sửa, xóa) phải kèm theo một **mã bí mật ngẫu nhiên** được tạo ra từ server. Nếu ai đó lừa bạn click vào một đường link độc hại, request đó sẽ không có mã này và bị từ chối.

---

## 6. Cài đặt & Triển khai

### 6.1. Chạy trên máy local (cho developer)

**Yêu cầu:**
- Node.js phiên bản 18 trở lên
- Tài khoản MongoDB Atlas (hoặc cài MongoDB trên máy)
- (Tùy chọn) Google Workspace với service account để có Google Calendar
- (Tùy chọn) SMTP để gửi email

```bash
# 1. Tải source code
git clone https://github.com/FinanceBullkk/ConCho2.git
cd ConCho2

# 2. Cài đặt dependencies
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..

# 3. Tạo file cấu hình server/.env (sao chép từ template)
cp server/.env.example server/.env
# Mở server/.env và điền JWT_SECRET, MONGO_URI, CRON_TOKEN, ... theo bảng bên dưới
# QUAN TRỌNG: server/.env nằm trong .gitignore — không bao giờ commit file này.
# Nếu bạn lỡ commit, ROTATE ngay tất cả secret bị lộ.

# 4. Tạo dữ liệu mẫu (admin + 2 giáo viên + 6 học viên + 2 lớp + lịch học)
cd server && npm run seed && cd ..

# 5. Khởi động
npm run dev:server   # Terminal 1: server tại cổng 5000
npm run dev:client   # Terminal 2: client tại cổng 5173
```

Mở `http://localhost:5173` — đăng nhập với:
- Admin: `000001` / `admin12345` (bị yêu cầu đổi mật khẩu ngay)
- Teacher: `000002` / `teacher123`
- Participant/Trưởng nhóm: `000004` / `participant123`

### 6.2. Triển khai lên Render.com

1. Push code lên GitHub
2. Render Dashboard → **New → Blueprint** → kết nối repo → chọn `render.yaml`
3. Điền các biến môi trường (bảng bên dưới)
4. Render tự động build và deploy
5. Cài đặt external cron pinger (xem `docs/cron-pinger-setup.md`) để hệ thống không bị "ngủ"

### 6.3. Triển khai bằng Docker

```bash
docker build -t tms-v2 .
docker run -d --name tms-v2 -p 5000:5000 --env-file .env tms-v2
```

### 6.4. Biến môi trường (Environment Variables)

| Tên biến | Bắt buộc? | Mô tả |
|----------|:---------:|-------|
| `NODE_ENV` | ✓ | `development` hoặc `production` |
| `MONGO_URI` | ✓ | Chuỗi kết nối MongoDB Atlas |
| `JWT_SECRET` | ✓ | Khóa bí mật ký token (chuỗi ngẫu nhiên 32 bytes) |
| `CORS_ORIGINS` | ✓ | URL frontend được phép gọi API |
| `CRON_TOKEN` | ✓ | Mã bí mật cho tác vụ tự động ban đêm |
| `CLIENT_ORIGIN` | ✓ | URL frontend (dùng trong email reset mật khẩu) |
| `SMTP_HOST` | | Máy chủ email (vd: `smtp.gmail.com`) |
| `SMTP_PORT` | | Cổng email (587 hoặc 465) |
| `SMTP_USER` | | Tài khoản gửi email |
| `SMTP_PASS` | | Mật khẩu email hoặc App Password |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | | JSON key của Google Service Account (cho Calendar) |
| `GOOGLE_CALENDAR_IMPERSONATE` | | Email tài khoản Google được ủy quyền |
| `SENTRY_DSN` | | DSN theo dõi lỗi production (Sentry) |
| `TMS_TIMEZONE` | | Múi giờ (mặc định UTC, khuyến nghị `Asia/Ho_Chi_Minh`) |
| `MFA_REQUIRED_ROLES` | | Vai trò bắt buộc bật 2FA (vd: `Admin`) |
| `LOG_LEVEL` | | Mức độ log: `info` (default), `debug`, `warn` |

---

## 7. Vận hành hằng ngày

### 7.1. Theo dõi sức khỏe hệ thống

```
GET /health  → Server có đang chạy không?
GET /ready   → Database đã kết nối chưa?
```

Cả hai trả về JSON với trạng thái, phiên bản, thời gian uptime.

### 7.2. Sao lưu & Khôi phục

- **MongoDB Atlas tự động snapshot** mỗi ngày — giữ 2 ngày gần nhất (gói miễn phí)
- **Khôi phục**: Atlas Dashboard → Clusters → Backup → chọn snapshot → Restore
- **Mục tiêu:** Mất tối đa 24 giờ dữ liệu (RPO) · Khôi phục trong 4 giờ (RTO)
- **Kiểm tra hàng tháng:** chạy `node server/scripts/verify-backup.js` để xác nhận backup hoạt động

Xem quy trình xử lý sự cố chi tiết tại `docs/backup-dr.md`.

### 7.3. Tác vụ tự động ban đêm

Mỗi đêm lúc **02:00 UTC**, hệ thống tự chạy kiểm tra dữ liệu (reconciliation). Vì Render miễn phí tắt server sau 15 phút không dùng, cần cài **external cron pinger** để đảm bảo tác vụ này chạy đúng giờ:

- Hướng dẫn: `docs/cron-pinger-setup.md`
- Dùng [cron-job.org](https://cron-job.org) (miễn phí) để gọi `POST /api/cron/reconcile` mỗi đêm

### 7.4. Xoay vòng khóa bí mật

**Xoay CRON_TOKEN** (định kỳ hoặc khi nghi bị lộ):
1. Tạo token mới → cập nhật biến môi trường trên Render → redeploy → cập nhật trên cron-job.org

**Xoay JWT_SECRET** (chỉ khi khóa bị lộ):
- Tất cả người dùng sẽ bị đăng xuất ngay lập tức — họ cần đăng nhập lại

---

## 8. Kiến trúc kỹ thuật (dành cho developer)

### 8.1. Tech stack

```
┌─────────────────────────────────────────────────────────┐
│                     TRÌNH DUYỆT (Client)                │
│  React 19 + Vite 8 + TailwindCSS + Radix UI            │
│  React Query (quản lý server state)                     │
│  React Hook Form + Zod (form & validation)              │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS + HttpOnly cookie + CSRF token
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    MÁYCHỦ (Express)                     │
│  Helmet · CORS · Pino Logger · Rate Limiters · CSRF    │
│  Routes → Controllers → Services → Mongoose ORM        │
│  Cron Jobs · Audit Logger · Reconcile Engine           │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              MongoDB Atlas (Database)                   │
│  12 collections: Users, Classes, Schedules,            │
│  Attendance, Evaluations, Teams, Enrollments,          │
│  AuditLog, Settings, Counter, TokenBlocklist...        │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
┌─────────▼───────┐       ┌─────────▼────────┐
│ Google Workspace│       │  SMTP (Email)    │
│ Calendar + Sheets│      │ Xác nhận lịch,   │
│ Meet links      │       │ reset mật khẩu  │
└─────────────────┘       └──────────────────┘
```

### 8.2. Cấu trúc thư mục

```
ConCho2/
├── client/                      # React SPA
│   └── src/
│       ├── pages/               # 28 trang (lazy-loaded)
│       ├── components/          # 33 component tái sử dụng
│       ├── hooks/               # 17 custom hooks
│       ├── context/             # AuthContext
│       ├── lib/                 # Zod schemas, Sentry, utils
│       └── api/                 # axios instance + interceptors
│
├── server/                      # Node.js/Express API
│   ├── routes/                  # 18 route files
│   ├── controllers/             # 15 controllers
│   ├── services/                # 9 business logic services
│   ├── models/                  # 12 Mongoose schemas
│   ├── middleware/              # auth, csrf, rateLimiters, validate
│   ├── jobs/                    # node-cron schedules
│   └── tests/                   # integration + unit + load tests
│
├── docs/                        # Tài liệu vận hành
│   ├── backup-dr.md             # Disaster recovery runbook
│   ├── cron-pinger-setup.md     # Hướng dẫn external cron
│   └── google-calendar-setup.md # Tích hợp Google Workspace
│
├── Dockerfile                   # Multi-stage production image
├── render.yaml                  # Render.com deploy blueprint
└── README.md                    # ← file này
```

### 8.3. Luồng xử lý request

```
Request đến
  → Gắn Request ID duy nhất (để trace log)
  → Structured log (Pino)
  → Security headers (Helmet: CSP, X-Frame-Options...)
  → CORS check
  → Parse cookie (JWT session)
  → Parse body JSON
  → Loại bỏ ký tự độc hại trong dữ liệu đầu vào
  → Rate limiter toàn cục
  → CSRF token check
  → Middleware đặc thù route (auth, roleGuard, validate, rate limit riêng)
  → Controller → Service → Mongoose
  → Response
  → Ghi audit log bất đồng bộ
  → Error handler → Sentry (nếu lỗi 5xx)
```

### 8.4. Luồng đăng nhập (Auth Flow)

```
POST /auth/login
  → Validate empCode + password
  → Kiểm tra tài khoản bị khóa chưa (failedLoginAttempts)
  → So khớp mật khẩu (bcrypt.compare)
  → Nếu có MFA: trả về mfaPendingToken (5 phút)
  → Nếu không MFA: set HttpOnly cookie (24 giờ)

POST /auth/mfa/verify (bước 2 nếu có MFA)
  → Xác thực TOTP code (±60s clock tolerance)
  → Hoặc dùng backup code (đánh dấu đã dùng)
  → Set HttpOnly cookie đầy đủ

Mọi request tiếp theo
  → middleware/auth.js verify cookie
  → Cache user 30 giây (giảm DB query)
  → Kiểm tra passwordChangedAt > token.iat (invalidate token cũ)
```

### 8.5. Database Schema

**Users** — Người dùng
```
empCode (unique), name, email, role, department, position
status (Active|Inactive|Dropped|Transferred|On-hold|Waiting for class)
password (bcrypt), passwordChangedAt, mustChangePassword
mfaEnabled, mfaSecret*, mfaBackupCodes*    (* select:false — ẩn khỏi response)
failedLoginAttempts, lockUntil
isDeleted, deletedAt                        (soft delete)
```

**Schedules** — Lịch học
```
classId, bookedTeamId, startTime, endTime
roomLink, meetLink, googleEventId
enrolledUsers: [userId]
Index UNIQUE: {classId, startTime}          ← chống double-booking đồng thời
```

> **Tại sao cần unique index?** Không đủ chỉ kiểm tra logic trong code — hai người có thể nhấn đặt lịch trong cùng một giây. Unique index ở database là lớp bảo vệ cuối cùng, đảm bảo chỉ một request thành công.

**Attendance** — Điểm danh
```
scheduleId, userId
status: P | A | L | EL
remark, photoUrl
syncStatus: PENDING | EXPORTED
Index UNIQUE: {scheduleId, userId}
```

**AuditLog** — Nhật ký
```
actorId, actorRole, actorEmpCode
action, entity, entityId
diff (before/after, password bị ẩn)
requestId, ip, userAgent
createdAt (TTL: 730 ngày)
```

### 8.6. Phân quyền (33 permissions × 3 roles)

| Nhóm quyền | Admin | Teacher | Participant |
|------------|:-----:|:-------:|:-----------:|
| Quản lý users (tạo/sửa/xóa) | ✓ | | |
| Xem danh sách users | ✓ | ✓ | |
| Quản lý lớp học | ✓ | | |
| Xem lớp học | ✓ | ✓ | ✓ |
| Tạo/sửa lịch dạy | ✓ | ✓ | |
| Xóa lịch dạy | ✓ | | |
| Điểm danh | ✓ | ✓ | |
| Đặt lịch cho nhóm mình | ✓ | | ✓ |
| Chấm điểm đánh giá | ✓ | ✓ | |
| Xuất/nhập dữ liệu | ✓ | | |
| Cấu hình hệ thống, audit log | ✓ | | |

---

## 9. Testing & Chất lượng

### 9.1. Tổng quan

| Loại test | Công cụ | Số lượng | Trạng thái |
|-----------|---------|----------|------------|
| Integration tests (API) | Jest + Supertest | 17 suites | ✅ 21/21 pass |
| Unit tests | Jest | 5 suites | ✅ Pass |
| Client tests | Vitest + RTL | 47+ cases | ✅ Pass |
| E2E (trình duyệt) | Playwright | 19 cases | ✅ Pass |
| Load tests | Artillery | Smoke/Load/Spike | ✅ Pass |
| **Tổng** | | **241+ cases** | **✅ 100%** |

> **Tại sao tests quan trọng?** Mỗi khi thêm tính năng mới hoặc sửa lỗi, có nguy cơ vô tình làm hỏng tính năng khác. 241 test cases chạy tự động mỗi lần commit — nếu có gì bị vỡ, phát hiện ngay trước khi lên production.

### 9.2. Chạy tests

```bash
# Server (Jest)
cd server && npm test

# Client (Vitest)
cd client && npx vitest run

# Với coverage report
cd client && npm run test:coverage
```

### 9.3. Performance

- Bundle JavaScript ban đầu: **~300KB** sau khi nén — tải nhanh
- Các trang ít dùng chỉ tải khi cần (lazy loading)
- Dữ liệu cache 30 giây — không gọi API thừa
- Analytics cache 60 phút — không tính lại mỗi lần xem

---

## 10. Xử lý sự cố thường gặp

### Không đăng nhập được

| Triệu chứng | Nguyên nhân | Giải pháp |
|-------------|-------------|-----------|
| "Thông tin đăng nhập không đúng" | Sai mã NV hoặc mật khẩu | Kiểm tra Caps Lock, số 0 đầu mã NV |
| "Tài khoản bị khóa" | Sai mật khẩu 5 lần | Đợi 15 phút, hoặc nhờ Admin mở khóa |
| Mã 2FA không đúng | Đồng hồ điện thoại lệch | Sync đồng hồ điện thoại với internet |
| Mất điện thoại có app 2FA | Không có TOTP | Dùng mã dự phòng đã lưu, hoặc nhờ Admin reset 2FA |

### Không đặt lịch được

| Triệu chứng | Nguyên nhân | Giải pháp |
|-------------|-------------|-----------|
| Slot hiển thị màu (không click được) | Nhóm khác đã đặt rồi | Chọn slot khác |
| "Đã đủ 2 buổi tuần này" | Vượt giới hạn 2 buổi/tuần | Đặt vào tuần sau |
| "Nhóm chưa có trưởng nhóm" | Thiếu leaderId | Admin vào Teams → chỉnh sửa → gán trưởng nhóm |

### Email không nhận được

- Kiểm tra thư mục **Spam/Junk**
- Với admin: kiểm tra biến môi trường SMTP trong Render
- Test nhanh: `node -e "require('./server/lib/mailer').sendMail({to:'test@gmail.com',subject:'test',text:'hi'})"`

### Google Calendar không hoạt động

1. Service account đã được cấp quyền **Domain-Wide Delegation** chưa?
2. `GOOGLE_CALENDAR_IMPERSONATE` đúng email chưa?
3. API Google Calendar đã bật trong GCP project chưa?

→ Chi tiết tại `docs/google-calendar-setup.md`

### Render chậm (request đầu tiên lâu ~30 giây)

Server bị "ngủ" sau 15 phút không có request. Giải pháp:
- Cài keep-warm pinger: `GET /api/cron/health` mỗi 10 phút trong giờ làm việc
- Hoặc upgrade Render lên gói Starter ($7/tháng) — không bao giờ sleep

---

## 11. Tài liệu liên quan

| File | Nội dung |
|------|----------|
| `AGENTS.md` | Contract cho Codex/Claude: Internal LTMS, không feature factory, done means wired |
| `CLAUDE.md` | Quy tắc làm việc cho Claude Code trong repo |
| `docs/system-overview.md` | Tổng quan kiến trúc + trạng thái hiện tại |
| `docs/development-roadmap.md` | Living tracker: milestone, changelog, quality gate |
| `docs/lms-roadmap.md` | Roadmap Internal LTMS 6 tháng cho 1000 nhân viên |
| `docs/backup-dr.md` | Quy trình xử lý sự cố, khôi phục dữ liệu |
| `docs/cron-pinger-setup.md` | Cài đặt tác vụ tự động ban đêm |
| `docs/google-calendar-setup.md` | Tích hợp Google Workspace |
| `/api/docs` *(khi server đang chạy)* | Swagger UI — thử API trực tiếp trên trình duyệt |
| `/api/docs.json` *(khi server đang chạy)* | OpenAPI spec — import vào Postman |

**GitHub:** `https://github.com/FinanceBullkk/ConCho2`

---

## 12. Lịch sử phát triển

Hệ thống được xây dựng qua **9 sprint**, từ prototype cơ bản đến production-grade:

| Sprint | Nội dung chính | Ý nghĩa |
|:------:|----------------|---------|
| 1 | Form validation, tài liệu Backup/DR | Nền tảng: không mất dữ liệu từ đầu |
| 2 | Skeleton loading, phân trang, bảo vệ CSRF, bộ test đầu tiên | UX mượt mà + bảo mật cơ bản |
| 3 | Quên mật khẩu, filter URL, audit log UI | Tự phục vụ + truy vết thao tác |
| 4 | Optimistic updates, mở rộng test | Tương tác nhanh hơn, độ tin cậy cao hơn |
| 5 | Graceful shutdown, Docker, toast, useRole, bulk actions | Sẵn sàng production |
| 6 | Dark/light mode, pagination analytics | Trải nghiệm người dùng |
| 7 | Integration tests 10 routes, middleware unit tests | Bảo đảm chất lượng trước khi mở rộng |
| 8 | Swagger docs, mobile menu, email xác nhận đặt lịch | Tài liệu hóa + mobile ready |
| 9 | Tìm kiếm Cmd+K, chuyển nhóm học viên, export đánh giá, RBAC guards, Playwright E2E, 18 bugfix (IDOR, anti-enumeration, re-auth, auto-release, weekly limit, booking grid key-matching) | Production hardening — sẵn sàng 200 users |

---

## License

MIT — sử dụng tự do nội bộ.

---

<p align="center">
  Được xây dựng cẩn thận · Bảo trì bởi L&D team<br/>
  <em>Câu hỏi? Liên hệ Admin team hoặc tạo issue trên GitHub.</em>
</p>
