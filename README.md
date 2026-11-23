# CamHome

Xem [CamHome Android k?t n?i tr?c ti?p YIQ6](docs/YIQ6_ANDROID.md) ?? build APK v? nghi?m thu qua Wi-Fi. [Windows bridge](docs/YIQ6_WINDOWS.md) l? c?ng c? ki?m th? ri?ng.

CamHome là ứng dụng Android thử nghiệm cho camera gia đình. Giao diện tiếng Việt gồm Trang chủ, Live View, Sự kiện & Lưu trữ, Thêm camera và Cài đặt. Phiên bản này hỗ trợ quản lý hồ sơ camera cục bộ và đọc QR bằng camera điện thoại. Kết nối YIQ6 vẫn chờ xác minh.

## Chạy trên Android

Cần Node.js 20.19.4 trở lên, JDK 17, Android SDK Platform 36, Build Tools 35.0.0 và 36.0.0, Platform Tools, NDK 27.1.12297006 và CMake 3.22.1. Thiết lập `ANDROID_HOME` trỏ tới SDK. Mở emulator Android hoặc bật USB debugging trên thiết bị rồi kiểm tra bằng `adb devices`. Nên dùng điện thoại thật để quét mã trên thân camera.

```sh
npm ci
npm run android
```

Lệnh trên tạo development build, cài và mở CamHome trên Android. Với development build đã cài, dùng `npm start` để khởi động lại Metro rồi mở CamHome. Khi điện thoại kết nối USB và cần truy cập Metro qua USB, chạy `adb reverse tcp:8081 tcp:8081`.

Trong CamHome, chọn **Thêm camera**, quét QR hoặc nhập IPv4, rồi lưu hồ sơ. Chọn hồ sơ để mở Live View. Đổi tên hoặc xóa thiết bị trong **Cài đặt camera**. Chức năng tìm trong LAN hiển thị trạng thái chưa xác minh trong phiên bản hiện tại.

## Kiểm tra

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:ui
npx expo export --platform android
```

- [Kiến trúc](docs/ARCHITECTURE.md)
- [Tương thích YIQ6](docs/YIQ6_COMPATIBILITY.md)
- [Kết quả kiểm thử](docs/TEST_REPORT.md)
- [Giới hạn hiện tại](docs/KNOWN_LIMITATIONS.md)

CamHome lưu hồ sơ thiết bị trên điện thoại. Hồ sơ ghép nối YIQ6 và ảnh do bridge chụp được lưu trên máy Windows.
