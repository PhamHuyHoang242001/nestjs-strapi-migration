# Fix 2 lỗi bảo mật Excel import/export (Data Hub)

Commit: `68a002d` ("ok _ 224", 11/11/2026). Giới hạn file 2MB cũng nằm trong commit này.

## Lỗi 1: Zip bomb khi import `.xlsx` (`loadImportWorkbook`)

**Nguyên nhân.** File `.xlsx` thực chất là một file zip chứa các file XML. Trước đây chỉ giới hạn dung lượng nén (5MB), còn ExcelJS giải nén toàn bộ và tạo object cho từng ô. Vì vậy một file vài KB chứa hàng triệu ô rỗng có thể chiếm hàng GB RAM và làm treo server.

**Cách sửa.** Thêm bước kiểm tra trước khi ExcelJS đọc file:

- `src/modules/data-hub/import/import-xlsx-size-guard.util.ts` (file mới) có hàm `assertXlsxWithinLimits(file)`:
  - tối đa 200 phần trong file zip;
  - tổng dung lượng sau giải nén tối đa 60MB;
  - tổng số ô của mọi sheet tối đa 100.000.
- Khi giải nén, dung lượng bị chặn cứng bằng `inflateRawSync({ maxOutputLength })`, không tin con số dung lượng mà file zip tự khai.
- Chỉ chấp nhận kiểu nén stored hoặc deflate. Vượt giới hạn trả 400 `FILE_TOO_LARGE`; file hỏng trả 400 `INVALID_FILE`.
- `src/modules/data-hub/import/import-workbook.util.ts`:
  - `loadImportWorkbook` (dòng 209) gọi `assertXlsxWithinLimits(file)` trước `workbook.xlsx.load`;
  - `IMPORT_FILE_BYTES` (dòng 85) giảm từ 5MB xuống 2MB. Giới hạn này được áp ở multer `FileInterceptor` (`import-helpers.util.ts`, dòng 215).

**Test:** `src/modules/data-hub/import/__tests__/import-xlsx-size-guard.spec.ts`.
- File 1 triệu ô rỗng (vài KB) bị từ chối trước khi đọc.
- Đếm được cả ô có namespace prefix (`<x:c>`).
- Một phần giải nén vượt tổng giới hạn thì bị từ chối.
- Phần khai 10 byte nhưng giải nén lớn vẫn bị chặn.
- File có quá nhiều phần, hoặc file không phải zip, bị từ chối.
- File thật lớn nhất (5000 dòng × 9 cột text dài) vẫn import được.

## Lỗi 2: Formula injection (CSV injection) trong export và file kết quả import

**Nguyên nhân.** Text do người dùng nhập, ví dụ `=HYPERLINK(...)` hay `+cmd|...`, được ghi nguyên vào file Excel. Khi người khác mở file, Excel chạy nó như công thức. Lỗi có ở hai chỗ:

- `exportExcelToResponse`: mọi API export.
- `buildResultWorkbook`: file kết quả import trả lại cho người dùng. File này chép lại nguyên ô người dùng đã upload, kể cả công thức và hyperlink.

**Cách sửa.**

- `src/common/utils/export-excel.helper.ts`:
  - Thêm `safeExcelText(value)`: text bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc CR thì được thêm dấu `'` ở đầu, nên Excel hiển thị đúng chữ thay vì chạy công thức.
  - Thêm `sanitizeRow(row)`: chỉ áp `safeExcelText` cho giá trị string; số, ngày, boolean và null giữ nguyên.
  - Mọi dòng export đều đi qua `sanitizeRow`, nên không caller nào ghi được text nguy hiểm. Hiện việc này nằm trong `exportExcelSheetsToResponse` (dòng 43); `exportExcelToResponse` cũng gọi lại hàm này.
- `src/modules/data-hub/import/import-workbook.util.ts`:
  - `neutralizeCell` (dòng 398), dùng trong `buildResultWorkbook` (dòng 408): mọi ô upload trả lại đều được làm vô hại. Text được thêm `'`; công thức, hyperlink và rich text được thay bằng text hiển thị của chúng (cũng qua `safeExcelText`).
  - Cột chi tiết lỗi trong file kết quả cũng qua `safeExcelText`.
  - `cellText` (dòng 123–147) bỏ dấu `'` mà bước chặn đã thêm. Nhờ vậy upload lại file kết quả hoặc file export vẫn ra đúng giá trị gốc, không bị dính `'`.
- `src/modules/data-hub/data-service/data-hub-data-service-export.service.ts`: `safeCell` dùng chung `safeExcelText` thay cho regex riêng trước đây. Regex cũ thiếu tab và CR.

**Test:** `src/modules/data-hub/import/__tests__/import-excel-formula-injection.spec.ts`.
- Text giống công thức được thêm `'`; text thường giữ nguyên.
- `sanitizeRow` chỉ đổi giá trị string.
- Mọi caller của export đều ghi text giống công thức ở dạng text.
- Công thức, link và text giống công thức trong file upload trả về đều vô hại, và import lại ra đúng giá trị gốc.

## Kiểm tra
- `tsc` sạch, toàn bộ test data-hub và common pass.
- Các export viết sau đó (app thụ hưởng, thuật ngữ, API/SFTP theo layout import) đều đi qua `exportExcelSheetsToResponse` → `sanitizeRow`, nên cũng được bảo vệ.
