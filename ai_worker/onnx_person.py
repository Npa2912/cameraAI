"""CPU inference for fixed-size, raw-output COCO YOLO11n exports."""

import cv2
import numpy as np
import onnxruntime as ort


class PersonDetector:
    def __init__(self, path, confidence=.6):
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        options.add_session_config_entry("session.intra_op.allow_spinning", "0")
        self.session = ort.InferenceSession(str(path), sess_options=options, providers=["CPUExecutionProvider"])
        inputs = self.session.get_inputs()
        if len(inputs) != 1 or inputs[0].type != "tensor(float)":
            raise ValueError("Expected one float32 YOLO11n input")
        self.input = inputs[0]
        shape = self.input.shape
        if len(shape) != 4 or shape[:2] != [1, 3] or shape[2] != shape[3] or shape[2] not in (320, 416, 640):
            raise ValueError("Expected batch 1 with fixed square input 320, 416 or 640")
        self.size = shape[2]
        self.confidence = confidence
        outputs = self.session.get_outputs()
        if len(outputs) != 1 or outputs[0].shape[:2] != [1, 84]:
            raise ValueError("Expected raw COCO detection output [1,84,N]")
        cv2.setNumThreads(1)

    def detect(self, frame):
        height, width = frame.shape[:2]
        ratio = min(self.size / width, self.size / height)
        w, h = max(1, round(width * ratio)), max(1, round(height * ratio))
        x, y = (self.size - w) // 2, (self.size - h) // 2
        canvas = np.full((self.size, self.size, 3), 114, dtype=np.uint8)
        canvas[y:y+h, x:x+w] = cv2.resize(frame, (w, h), interpolation=cv2.INTER_LINEAR)
        rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)
        tensor = np.ascontiguousarray(rgb.transpose(2, 0, 1)[None], dtype=np.float32) / np.float32(255)
        rows = self.session.run(None, {self.input.name: tensor})[0][0].T
        # COCO person is class zero. Require it to be the highest-scoring class.
        selected = rows[(rows[:, 4] >= self.confidence) & (rows[:, 4:].argmax(axis=1) == 0)]
        boxes, scores = [], []
        for cx, cy, bw, bh, score in selected[:, :5]:
            left = max(0, int((cx - bw / 2 - x) / ratio))
            top = max(0, int((cy - bh / 2 - y) / ratio))
            right = min(width, int((cx + bw / 2 - x) / ratio))
            bottom = min(height, int((cy + bh / 2 - y) / ratio))
            if right > left and bottom > top:
                boxes.append([left, top, right-left, bottom-top])
                scores.append(float(score))
        keep = cv2.dnn.NMSBoxes(boxes, scores, self.confidence, .45) if boxes else []
        return [(boxes[i], scores[i]) for i in np.asarray(keep, dtype=int).reshape(-1)]

    def jpeg(self, frame, people):
        for (x, y, width, height), score in people:
            cv2.rectangle(frame, (x, y), (x+width, y+height), (80, 235, 130), 2)
            cv2.putText(frame, f"Person {score:.0%}", (x, max(16, y-4)),
                        cv2.FONT_HERSHEY_SIMPLEX, .5, (80, 235, 130), 1)
        ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok:
            raise ValueError("JPEG encoding failed")
        return encoded.tobytes()
