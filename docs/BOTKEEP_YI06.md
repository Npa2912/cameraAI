# CamHome trên Botkeep Founder Free

Chọn **Npa2912/cameraAI → feature/yiq6-lan**, thư mục gốc, Python 3.11,
lệnh khởi động `python -u main.py`. Dependencies ở requirements.txt gốc.
Runtime dùng FFmpeg qua PyAV, OpenCV headless và ONNX Runtime CPU. Tạo bản
export YOLO11n COCO ở môi trường chuẩn bị riêng bằng
`yolo export model=yolo11n.pt format=onnx imgsz=320 dynamic=False nms=False simplify=False`.
Đưa file ONNX tin cậy lên server bằng Files và đặt CAMHOME_ONNX_MODEL
trong Environment. Hosting không cần PyTorch.

## Xác minh video trước

Yunyi công bố P2P, Open API và cloud-to-cloud, nhưng chưa xác nhận quyền
server cho YI06 ghép với tài khoản cá nhân. Cần Yunyi cấp quyền và tài liệu
cho đúng thiết bị, định dạng, cơ chế cấp/gia hạn phiên và điều kiện chạy nền
qua CGNAT. Nếu giao diện được cấp chỉ có SDK P2P, cần adapter SDK chính thức.
Adapter hiện tại chỉ nhận URL HTTPS video được cấp, ví dụ HLS, và chưa tạo
hoặc gia hạn URL theo API của Yunyi. Nếu URL hết hạn, cấu hình cần được
gia hạn bằng cơ chế chính thức trước khi có thể vận hành tự chủ.

1. Trong Environment đặt `CAMHOME_MODE=probe` và `CAMHOME_YUNYI_STREAM_URL`
   do hãng hoặc SDK hợp lệ cấp. Dùng Environment để giữ URL có token.
2. Tắt Windows và điện thoại. Chạy probe. Console phải xác nhận 16 frame đã
   giải mã. Đối chiếu chuyển động có mốc giờ qua công cụ xem riêng được cấp
   quyền để xác nhận đúng camera và nguồn trực tiếp.
3. Chỉ sau khi probe đạt và quyền gia hạn phiên đã rõ, chạy `CAMHOME_MODE=live`.
   Đặt `NOTIFY_SECRET` hiện có, `CAMHOME_PHOTO_KEY` ngẫu nhiên, và
   `CAMHOME_PUBLIC_ORIGIN` là origin HTTPS từ Botkeep Domains. Cấu hình
   `CAMHOME_AI_DB` vào vùng lưu trữ bền vững, giữ một instance.
4. Kiểm thử ảnh thật trên Zalo khi Windows và điện thoại tắt. Đối chiếu
   ảnh đầu và ảnh mới mỗi 15 giây khi còn người. Ngắt/khôi phục kết nối và
   khởi động lại server, kiểm tra trạng thái ở Console và /health.
   Dùng panel đo CPU, RAM, ổ đĩa và thử liên tục ít nhất 24 giờ.

Bản live giới hạn ONNX/OpenCV/giải mã một luồng mỗi phần, lấy mẫu mặc định
2 FPS, dùng URL JPEG ký số 5 phút và loại bỏ cảnh báo cũ. Nó mở lại luồng
với backoff tối đa 30 giây. Kiểm tra cơ chế tự restart sau khi tiến trình
thoát trên panel Botkeep thực. Không cung cấp nguồn camera cho route công khai.

[Python trên Botkeep](https://botkeep.cloud/docs/python) ·
[Yunyi Open Platform](https://www.yunyiiot.com/index.html)
