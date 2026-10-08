# Định hướng phân quyền Skill

Giả định: **không check quyền tạo** — ai login cũng `POST /items`. Tách việc ghi còn lại thành **edit** và **approve**. SO là owner **cả workspace Skill** (`skill_packages`), không phải từng package. Prompt / API catalog cùng pattern, SO tách từng workspace.

**Edit skill = tạo version mới** (`PUT /items/:id/versions`). **Sửa version** = `PUT /versions/:vid`.

Bản vẽ: [skill-permission-redesign.html](./skill-permission-redesign.html). Hiện tại: [skill-permission-flow.html](./skill-permission-flow.html).

## Giả định: ai cũng tạo được

Hai nhánh edit sau khi bỏ `skill_create` / `skill_upload` trên POST.

### Nhánh 1 — chỉ edit của mình

Người A tạo skill X → chỉ A edit skill X và sửa version rejected của A.

**Vấn đề:** A nghỉ việc → skill mồ côi, không ai `PUT /items/:id/versions`.

**Xử lý:** không mở edit-all. **SO Skill** edit mọi package (kể cả người đã nghỉ). Có thể thêm chuyển `created_by` sau.

### Nhánh 2 — edit được của nhau

Đồng nghiệp bump được skill người nghỉ — không mồ côi.

**Vấn đề:** nhiều người sửa cùng skill → 409 một pending, đè ý nhau, hàng chờ Approver phình, Approver phải check loạn.

**Kết luận:** không mở edit-all cho mọi user. Chỉ SO được edit chéo.

## Approver sửa pending — rủi ro

Hiện Approver `PUT /versions/:vid` khi pending, bỏ qua field cấm, `submitted_by` giữ author, **không audit log**.

Approver không đủ năng lực → sửa linh tinh, catalog sau approve trông như author viết, không truy được.

**Nên:** Approver chỉ approve / reject / ẩn-hiện. Sửa pending → reject cho author, hoặc **chỉ SO sửa** (và nên log editor).

## Mô hình đề xuất

| Việc | API | Ai được |
|---|---|---|
| Tạo skill | `POST /items` | Mọi user login |
| Edit skill = tạo version mới | `PUT /items/:id/versions` | Người tạo package, hoặc SO Skill |
| Sửa version rejected | `PUT /versions/:vid` | Submitter / người tạo package (newest), hoặc SO |
| Sửa version pending | `PUT /versions/:vid` | **Chỉ SO Skill** |
| Approve / reject | `POST approve` / `reject` | Approver hoặc SO |
| Ẩn/hiện | `PATCH /items/:id/status` | Approver hoặc SO |
| Đọc catalog active | GET items / download / preview | Bearer. Inactive / hàng chờ: Approver hoặc SO |

SO Prompt / SO API catalog tách workspace, không đụng skill. Dù chỉ SO sửa pending, vẫn nên ghi `edited_by` / audit — thiếu log thì SO sửa cũng không truy được.
