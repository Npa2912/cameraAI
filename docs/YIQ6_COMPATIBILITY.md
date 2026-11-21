# Tương thích YI IoT YIQ6

Thiết bị người dùng mô tả là YIQ6 xoay 360° với ba anten. Phiên bản phần cứng, firmware và định danh model từ nhãn hoặc màn hình thông tin thiết bị chưa được đối chiếu. Môi trường triển khai chưa có thông tin truy cập camera thật.

## Bằng chứng

- README của yi-hack-Allwinner-v2 mô tả máy chủ RTSP và ONVIF do firmware sửa đổi cung cấp và liệt kê các tổ hợp model, số sê-ri và firmware được hỗ trợ. Danh sách đọc được không ghi YIQ6. Dự án công bố giấy phép MIT. CamHome chỉ tham khảo tài liệu này. [README và danh sách thiết bị](https://github.com/roleoroleo/yi-hack-Allwinner-v2#supported-cameras)
- Thử truy cập cổng hỗ trợ YI và danh mục thiết bị ONVIF từ môi trường đám mây bị proxy từ chối. Hai nguồn này chưa cung cấp được bằng chứng về thiết bị mục tiêu. [Hỗ trợ YI](https://help.yitechnology.com/) · [Danh mục ONVIF](https://www.onvif.org/conformant-products/)

| Khả năng trên YIQ6                                 | Trạng thái |
| -------------------------------------------------- | ---------- |
| Dò trong LAN, ghép nối Wi-Fi và định dạng QR Wi-Fi | Unknown    |
| RTSP, ONVIF, P2P và xác thực                       | Unknown    |
| Video trực tiếp, nhận âm thanh và đàm thoại        | Unknown    |
| PTZ và cấu hình chất lượng                         | Unknown    |
| Chụp ảnh, ghi, phát lại, sự kiện và dung lượng thẻ | Unknown    |

Quét QR bằng điện thoại chỉ đọc dữ liệu mã. Chức năng này độc lập với mọi giao thức YIQ6.

## Xác minh trên thiết bị

Ghi lại model chính xác, phiên bản phần cứng và firmware từ nhãn hoặc ứng dụng được nhà sản xuất hỗ trợ. Trên mạng được cấp phép, kiểm tra tài liệu đúng phiên bản và xem camera có tùy chọn LAN, RTSP hoặc ONVIF chính thức hay không. Khi có giao thức được công bố và bật trên thiết bị, thử kết nối bằng thông tin xác thực hợp lệ rồi ghi nhận kết quả từng khả năng. Tránh đưa UID, mật khẩu và mã QR vào báo cáo.
