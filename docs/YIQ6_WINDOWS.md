# YIQ6 qua LAN trên Windows

CamHome dùng bridge Python tại máy Windows. Bridge dùng thư viện TNP và bộ ghép frame từ bản OpenYI cục bộ (MIT), đọc hồ sơ DPAPI bằng tài khoản Windows đã ghép nối và giải mã H.264 bằng PyAV. Android nhận các khung JPEG mới qua HTTP LAN, có mã truy cập riêng lưu bằng SecureStore. Chế độ này ưu tiên triển khai với Expo Android dev build. Mỗi bridge phục vụ một camera.

## Khởi chạy

Từ thư mục `cameraAI`:

```powershell
python -m pip install --user --only-binary=:all: av==19.0.1 pillow==12.3.0 pycryptodome==3.24.0
python -B yiq6_bridge.py --openyi '..\YI-Cam-main' --camera 192.168.50.31 --listen 192.168.50.10 --broadcast 192.168.50.255 --probe
python -B yiq6_bridge.py --openyi '..\YI-Cam-main' --camera 192.168.50.31 --listen 192.168.50.10 --broadcast 192.168.50.255
npm.cmd run android
```

Dùng địa chỉ broadcast đúng với subnet Wi-Fi của Windows. YIQ6 này đã phản hồi qua broadcast discovery. Cần Python 3.12 trên Windows, checkout OpenYI, hồ sơ `%LOCALAPPDATA%\YI Local\device.dpapi` và môi trường Expo Android hiện có. Với hồ sơ bổ sung, truyền `--profile` trỏ đến tệp DPAPI tương ứng. PyAV cung cấp decoder trong wheel Windows. Dùng Wi-Fi riêng đáng tin cậy vì HTTP không mã hóa video và mã truy cập. Nếu Windows Firewall chặn điện thoại, cho phép TCP 8765 trên mạng Private và giới hạn nguồn đến điện thoại hoặc subnet LAN.

1. Sau khi ghép nối, ngắt phiên camera trong OpenYI để kiểm tra bridge độc lập. Probe chỉ trả mã thành công khi giải mã được ít nhất một frame thật.
2. Trong CamHome, lưu camera với IP `192.168.50.31`. Mở camera, chọn **Cài đặt camera**, nhập `192.168.50.10:8765` và mã truy cập hiện trên terminal Windows, rồi chọn **Lưu bridge YIQ6**. Sau khi khởi động lại bridge, cập nhật mã truy cập mới.
3. Quay lại màn hình camera. Kiểm tra hình ảnh chuyển động thực tế, Online, độ phân giải và FPS nguồn. Tốc độ hiển thị có thể thấp hơn FPS nguồn do mã hóa JPEG và lấy khung hình định kỳ.
4. Chọn **Chụp ảnh**, đối chiếu ảnh với video trong thư mục `Pictures\CamHome` trên Windows. Chọn **Ngắt kết nối**, sau đó **Kết nối** và kiểm tra hình ảnh trở lại.
5. Khi có thể gián đoạn camera, ngắt Wi-Fi hoặc nguồn camera. Kiểm tra Offline, sau đó khôi phục nguồn hoặc Wi-Fi và kiểm tra hình ảnh tự trở lại. Nếu DHCP cấp IP khác, chỉnh địa chỉ camera và khởi động bridge với IP đúng.

## Kiểm tra qua USB

Để kiểm tra trình hiển thị Android khi Windows Firewall chặn TCP qua Wi-Fi, khởi động bridge với `--listen 127.0.0.1` và cùng địa chỉ `--broadcast` như trên. Chạy `adb reverse tcp:8765 tcp:8765` và dùng `127.0.0.1:8765` trong cài đặt CamHome. Windows vẫn nhận video từ YIQ6 qua LAN. Khi thử Wi-Fi, dùng địa chỉ LAN của bridge trong CamHome.

## PTZ

Sau khi xác nhận camera xoay được qua OpenYI, thêm `--ptz` khi khởi động bridge và thử từng hướng trong CamHome. Bridge sử dụng xung xoay ngắn từ OpenYI và áp dụng thiết lập đảo chiều trong hồ sơ. PTZ mặc định tắt.

## Kiểm tra tự động

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:ui
python -B -m unittest discover -s tests -p test_yiq6_bridge.py
```

Các test HTTP dùng dữ liệu kiểm thử trong thư mục tạm. Probe và kiểm tra trên điện thoại cần camera thật. Giao diện bridge hiện cung cấp ảnh chụp trên Windows, không phát âm thanh. Nguồn OpenYI được sử dụng trực tiếp từ checkout ngoài repository theo giấy phép MIT trong tệp `LICENSE` của OpenYI.
