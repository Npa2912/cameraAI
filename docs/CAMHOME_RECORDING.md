# Ghi hình CamHome

## Phạm vi của APK ghi hình

- Live View và bộ ghi dùng cùng phiên TNP. Native worker chuyển tham chiếu khung H.264 đã sắp thứ tự sang hàng đợi ghi có giới hạn. Worker của MediaMuxer xử lý luồng riêng. Nếu hàng đợi đầy, dừng ghi và báo lỗi; Live View tiếp tục.
- MP4 có một track AVC. Bộ ghi lấy SPS/PPS từ luồng, mở mỗi đoạn ở khung khóa, dùng thời gian camera cho PTS và lưu thời điểm máy nhận khung đầu theo UTC. Đoạn đổi ở khung khóa tại hoặc sau mốc 5 phút trên đồng hồ. Qua nửa đêm UTC+7, đoạn cũ kết thúc và đoạn mới đợi khung khóa.
- SQLite lưu camera ID, thời gian, kích thước, SHA-256, số khung, độ phân giải và trạng thái. Video được kiểm tra track AVC và mẫu đồng bộ đầu tiên bằng MediaExtractor trước khi công bố. Sau crash, phần đã chuẩn bị có thể được công bố lại; file đang ghi dở được đánh dấu gián đoạn. Không sinh bản ghi cho khoảng trống.
- Chế độ ghi hiện tại dùng **Ghi video** trong Live View. Khi rời Live View, tắt màn hình hoặc ứng dụng vào nền, phiên hiện tại sẽ đóng và bộ ghi hoàn tất đoạn nếu có thể. Khi mất mạng khi Live View còn hoạt động, đoạn được đóng và đoạn tiếp theo bắt đầu sau reconnect nếu chế độ ghi vẫn bật.
- Xem lại trên điện thoại dùng Android VideoView. Timeline tô màu theo các đoạn thật, hỗ trợ nhập `HH:mm:ss`, chạm timeline, zoom và pan. Khi có khoảng trống dài hơn 500 ms, người xem có thể chọn đoạn tiếp theo.

## Chạy liên tục

Điện thoại phải có nguồn và đường mạng tới camera. Bản ghi nền liên tục cần chuyển quyền sở hữu socket sang foreground service do người dùng khởi động. Live View sau đó đăng ký làm đầu ra thứ hai của cùng phiên TNP. Type `connectedDevice` là ứng viên cho phiên với camera LAN nếu đáp ứng điều kiện Android. Tác vụ upload là công việc riêng và phải tính đến giới hạn chạy nền Android. [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types) · [Foreground service timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout)

Khi điện thoại tắt nguồn hoặc rời LAN mà camera vẫn cần ghi, phải có recorder khác đang chạy trong mạng camera. Recorder tương lai có thể xuất MP4 và metadata theo cùng hợp đồng, dùng cùng múi giờ UTC+7 và dùng khóa sở hữu phiên theo camera để tránh ghi trùng.

## Chuẩn bị Google Drive

1. Tạo project Google Cloud thuộc quyền bạn, bật Google Drive API và cấu hình màn hình OAuth. Nếu chọn trạng thái Testing, thêm tài khoản Drive đích vào danh sách test users.
2. Tạo OAuth client loại Android cho package `com.camhome.cameraai`, với SHA-1 của chứng chỉ thực sự ký APK sẽ dùng. Xem chứng chỉ bằng `apksigner verify --print-certs app-standaloneDebug.apk` trong SDK. Không cần gửi mật khẩu hoặc token.
3. Khi luồng kết nối được tích hợp, cấp quyền `https://www.googleapis.com/auth/drive.file` trên điện thoại. Phạm vi này cho phép app quản lý các tệp được cấp quyền riêng. [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

APK hiện tại chưa kết nối Google. Hàm retention thuần đã có test cho giới hạn `300000000000` byte, quota tài khoản, thứ tự ngày, đoạn vượt nửa đêm, bản ghi được bảo vệ và chỉ mục lỗi. Chưa có đường gọi xóa Drive. Khi nối API cần đồng bộ toàn bộ phạm vi CamHome trước mỗi đợt dọn, xác minh ownership, file ID và metadata, kiểm tra lại quota sau từng ngày, lưu audit và đối soát sau lỗi. Dùng ID tạo trước cho upload có thể retry, kiểm tra metadata và checksum Drive trước khi đánh dấu đã upload. [Drive resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads) · [Create and manage files](https://developers.google.com/workspace/drive/api/guides/create-file) · [Account quota](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get)
