# Kiến trúc CamHome

- `src/navigation` quản lý màn hình và nút Back của Android. `src/features` chứa các màn hình. `src/components` chứa các thành phần giao diện dùng chung.
- `CameraAdapter` định nghĩa dò tìm, ghép nối, kết nối, video, âm thanh, PTZ, chụp ảnh và bản ghi. Mọi thao tác với camera IP đi qua hợp đồng này. Camera điện thoại dùng để đọc QR qua Expo Camera.
- `UnverifiedAdapter` trả về `Unknown` cho các khả năng của YIQ6 và báo lỗi rõ ràng khi gọi thao tác thiết bị. `Verified` yêu cầu bằng chứng thử nghiệm trên đúng thiết bị và firmware. `Unsupported` cần bằng chứng khả năng cụ thể không được cung cấp.
- `connectWithRetry` giới hạn kết nối lại ở ba lần thử thêm sau 500, 1000 và 2000 ms cho lỗi ngoại tuyến hoặc timeout. Hook hủy phiên và gọi `disconnect` khi thoát Live View hoặc tạo lần thử mới. Adapter triển khai về sau cần tôn trọng tín hiệu hủy và dọn trạng thái phiên của nó.
- `src/storage` lưu tên và địa chỉ bằng AsyncStorage. Nội dung QR được coi là dữ liệu nhãn chưa xác thực, lưu riêng bằng Expo SecureStore trên Android. Hiện chưa thu thập thông tin đăng nhập.
- Khi có giao thức được xác minh, adapter sẽ phải quản lý luồng và giải mã tại thành phần native, đồng thời cung cấp tài nguyên phát cho UI qua hợp đồng adapter. Micro cần xin quyền đúng lúc. PTZ cần lệnh dừng tại lúc nhả và khi phiên bị ngắt. Các phần này còn chờ triển khai.
