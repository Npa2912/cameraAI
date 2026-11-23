# CamHome Android và YIQ6 qua LAN

## Luồng chạy

CamHome dùng TNP/UDP qua Wi-Fi để tìm và xác thực camera. Driver Java xử lý ACK, truyền lại lệnh, ghép các gói theo thứ tự và giải mã phần dữ liệu cần thiết của khung hình khóa. MediaCodec giải mã H.264 lên TextureView. JavaScript quản lý hồ sơ, trạng thái và thao tác màn hình. Android dừng phiên khi ứng dụng vào nền hoặc rời Live View và mở lại phiên khi quay lại. Driver dò lại theo UID nếu camera đổi IP.

Driver được viết dựa trên giao thức TNP stock và logic thứ tự khung hình từ YI Local. Xem [giấy phép MIT](YILOCAL-LICENSE.txt). [Công cụ Windows](YIQ6_WINDOWS.md) vẫn dùng được khi kiểm thử riêng.

## Thêm thiết bị với khóa đã có

1. Đặt điện thoại trên cùng LAN với camera. Vào **Thêm camera**, chọn **Tìm camera TNP trong LAN**, rồi chọn IP camera. Nếu broadcast bị chặn, nhập IP camera hiện tại.
2. Đặt tên và nhập khóa TNP 15 byte do chủ camera cung cấp. Mật khẩu Wi-Fi, mật khẩu tài khoản và mã QR trên vỏ camera là dữ liệu khác.
3. Chọn **Xác thực và lưu YIQ6**. CamHome chỉ lưu sau khi camera phản hồi lệnh xác thực. Kho hồ sơ lưu địa chỉ và UID, còn SecureStore lưu khóa với Android Keystore.
4. Chọn thiết bị để mở Live View. Trạng thái trang chủ phản ánh phản hồi discovery; trạng thái Live View chuyển Online sau khi MediaCodec xuất khung hình.

Việc cấp khóa và ghép nối độc lập vẫn chưa triển khai. [Tài liệu YI IoT](https://yiiot.net/faq/) mô tả quy trình QR trong ứng dụng hãng và chưa cung cấp API cấp khóa TNP cho CamHome. Bản này dùng khóa hợp lệ có sẵn của camera stock đã ghép nối. Ứng dụng gửi lệnh phiên LAN và không chạy quy trình đổi firmware hay cấu hình Wi-Fi của camera.

## Build và nghiệm thu

Từ thư mục `android`, chạy `gradlew.bat :app:assembleStandaloneDebug -PreactNativeArchitectures=arm64-v8a`. Tùy chọn này đóng gói JavaScript vào APK debug và bỏ Expo Dev Launcher cho bản kiểm thử độc lập. APK dự kiến ở `android/app/build/outputs/apk/standaloneDebug/app-standaloneDebug.apk`.

1. Cài debug APK lên điện thoại thật. Kiểm tra điện thoại và camera cùng LAN.
2. Trên thiết bị thử, xác nhận `adb reverse --list` không có ánh xạ CamHome. Tắt Windows bridge, rút USB và tắt Windows.
3. Mở CamHome, xác thực YIQ6, vào Live View và kiểm tra hình ảnh thay đổi theo cảnh thật.
4. Chụp ảnh và kiểm tra ảnh trên điện thoại. Thử các nút PTZ và kiểm tra camera dừng sau mỗi xung nếu mẫu kiểm thử hỗ trợ.
5. Tắt rồi bật Wi-Fi điện thoại trong Live View. Kiểm tra trạng thái và video tự trở lại, sau đó đóng và mở lại CamHome để kiểm tra hồ sơ đã lưu.

Chỉ đánh dấu đạt sau khi thực hiện trên YIQ6 thật với Windows tắt và USB đã rút.
