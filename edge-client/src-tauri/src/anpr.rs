//! ANPR plate sources. `PlateSource` is the seam: `ManualPlateSource` is fed
//! by the operator UI / tests; `RtspOnnxSource` pipes an RTSP camera through
//! an ffmpeg sidecar into ONNX detector+recognizer models.
//!
//! ONNX inference is behind the `onnx` cargo feature (`dep:ort`) — the
//! runtime binary is large and Windows-specific, so default builds and the
//! Linux test image compile without it. Without the feature,
//! `RtspOnnxSource::spawn` returns a clear error.

use std::path::PathBuf;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use async_trait::async_trait;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::mpsc;
use tracing::info;

#[derive(Debug)]
pub struct PlateReading {
    pub plate: String,
    pub confidence: f32,
    pub plate_image_path: Option<PathBuf>,
    pub overview_image_path: Option<PathBuf>,
}

#[async_trait]
pub trait PlateSource: Send {
    async fn next(&mut self) -> Option<PlateReading>;
}

/// Fed by the Tauri `manual_plate` command or test code — also the default
/// when `camera_rtsp_url` is not configured.
pub struct ManualPlateSource {
    rx: mpsc::Receiver<PlateReading>,
}

impl ManualPlateSource {
    pub fn new(rx: mpsc::Receiver<PlateReading>) -> Self {
        Self { rx }
    }

    /// Convenience: returns (sender, source).
    pub fn channel(capacity: usize) -> (mpsc::Sender<PlateReading>, Self) {
        let (tx, rx) = mpsc::channel(capacity);
        (tx, Self::new(rx))
    }
}

#[async_trait]
impl PlateSource for ManualPlateSource {
    async fn next(&mut self) -> Option<PlateReading> {
        self.rx.recv().await
    }
}

/// Same-plate debounce: a vehicle sitting in front of the camera produces
/// hundreds of identical reads — only the first within `window` is emitted.
pub struct Dedup {
    window: Duration,
    last_plate: Option<String>,
    last_at: Instant,
}

impl Dedup {
    pub fn new(window: Duration) -> Self {
        Self {
            window,
            last_plate: None,
            last_at: Instant::now(),
        }
    }

    /// true → new reading to process; false → suppressed duplicate.
    pub fn admit(&mut self, plate_normalized: &str, now: Instant) -> bool {
        let dup = self.last_plate.as_deref() == Some(plate_normalized)
            && now.duration_since(self.last_at) < self.window;
        if !dup {
            self.last_plate = Some(plate_normalized.to_string());
            self.last_at = now;
        }
        !dup
    }
}

/// RTSP → ffmpeg sidecar (JPEG frames over stdout) → ONNX detector +
/// recognizer → `PlateReading`s with a 3s debounce.
///
/// `spawn` fails fast when `model_dir` lacks `detector.onnx` /
/// `recognizer.onnx`, or when the binary was built without the `onnx`
/// feature — misconfiguration must be loud at boot, not silent.
pub struct RtspOnnxSource {
    rx: mpsc::Receiver<PlateReading>,
    _child: tokio::process::Child,
}

impl RtspOnnxSource {
    /// direction is retained for parity with the pipeline contract (each
    /// camera/lane is provisioned for entry or exit in EdgeConfig).
    pub fn spawn(rtsp_url: &str, model_dir: &std::path::Path, _direction: &str) -> Result<Self> {
        let detector = model_dir.join("detector.onnx");
        let recognizer = model_dir.join("recognizer.onnx");
        for f in [&detector, &recognizer] {
            anyhow::ensure!(f.exists(), "ANPR model file missing: {}", f.display());
        }
        anyhow::ensure!(
            cfg!(feature = "onnx"),
            "RtspOnnxSource requires the `onnx` build feature (dep:ort) — \
             build with `--features onnx` to enable inference"
        );

        // ffmpeg sidecar: RTSP → MJPEG frames on stdout (SOI..EOI delimited).
        let mut child = Command::new("ffmpeg")
            .args([
                "-rtsp_transport",
                "tcp",
                "-i",
                rtsp_url,
                "-vf",
                "fps=5",
                "-f",
                "image2pipe",
                "-vcodec",
                "mjpeg",
                "-",
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .context("spawn ffmpeg sidecar")?;

        let stdout = child.stdout.take().context("ffmpeg stdout")?;
        let (frame_tx, frame_rx) = mpsc::channel::<Vec<u8>>(16);

        // Frame splitter: JPEG = 0xFFD8 ... 0xFFD9
        tokio::spawn(async move {
            let mut buf = Vec::new();
            let mut chunk = [0u8; 8192];
            let mut rd = stdout;
            loop {
                match rd.read(&mut chunk).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        buf.extend_from_slice(&chunk[..n]);
                        while let Some(soi) = find_marker(&buf, 0xFFD8) {
                            match find_marker(&buf[soi + 2..], 0xFFD9) {
                                Some(eoi) => {
                                    let frame: Vec<u8> = buf[soi..soi + 2 + eoi + 2].to_vec();
                                    buf.drain(..soi + 2 + eoi + 2);
                                    if frame_tx.blocking_send(frame).is_err() {
                                        return;
                                    }
                                }
                                None => {
                                    buf.drain(..soi);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        });

        let (reading_tx, rx) = mpsc::channel::<PlateReading>(8);
        tokio::spawn(inference_worker(detector, recognizer, frame_rx, reading_tx));
        info!("RtspOnnxSource spawned for {rtsp_url}");
        Ok(Self { rx, _child: child })
    }
}

fn find_marker(buf: &[u8], marker: u16) -> Option<usize> {
    let hi = (marker >> 8) as u8;
    let lo = marker as u8;
    buf.windows(2).position(|w| w[0] == hi && w[1] == lo)
}

#[cfg(feature = "onnx")]
async fn inference_worker(
    detector: PathBuf,
    recognizer: PathBuf,
    mut frames: mpsc::Receiver<Vec<u8>>,
    readings: mpsc::Sender<PlateReading>,
) {
    let worker = match onnx_worker::OnnxWorker::load(&detector, &recognizer) {
        Ok(w) => w,
        Err(e) => {
            tracing::warn!("ONNX session load failed: {e}");
            return;
        }
    };
    let mut dedup = Dedup::new(Duration::from_secs(3));
    while let Some(jpeg) = frames.recv().await {
        match worker.detect_and_read(&jpeg) {
            Ok(Some((plate, conf))) => {
                if dedup.admit(&crate::access::normalize_plate(&plate), Instant::now()) {
                    if readings
                        .send(PlateReading {
                            plate,
                            confidence: conf,
                            plate_image_path: None,
                            overview_image_path: None,
                        })
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
            }
            Ok(None) => {}
            Err(e) => tracing::warn!("inference error: {e}"),
        }
    }
}

#[cfg(not(feature = "onnx"))]
async fn inference_worker(
    _detector: PathBuf,
    _recognizer: PathBuf,
    mut frames: mpsc::Receiver<Vec<u8>>,
    _readings: mpsc::Sender<PlateReading>,
) {
    // unreachable — spawn() guards on cfg!(feature = "onnx"); drain to keep
    // the ffmpeg child from blocking on a full pipe.
    while frames.recv().await.is_some() {}
}

#[async_trait]
impl PlateSource for RtspOnnxSource {
    async fn next(&mut self) -> Option<PlateReading> {
        self.rx.recv().await
    }
}

#[cfg(feature = "onnx")]
mod onnx_worker {
    //! YOLO-style detector + CRNN recognizer via `ort`.
    //! NOTE: detector is assumed to emit `[1, N, 6]` rows
    //! (x1,y1,x2,y2,conf,cls) after NMS; the recognizer emits CTC logits
    //! decoded by argmax. Model-specific postprocessing may need adjustment
    //! for the deployed weights — keep the preprocessing contract in sync
    //! with the training export.

    use anyhow::{Context, Result};
    use image::{imageops::FilterType, DynamicImage};
    use ort::session::Session;
    use std::path::Path;

    const ALPHABET: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    pub struct OnnxWorker {
        detector: Session,
        recognizer: Session,
    }

    impl OnnxWorker {
        pub fn load(detector: &Path, recognizer: &Path) -> Result<Self> {
            let detector = Session::builder()?
                .commit_from_file(detector)
                .context("detector session")?;
            let recognizer = Session::builder()?
                .commit_from_file(recognizer)
                .context("recognizer session")?;
            Ok(Self {
                detector,
                recognizer,
            })
        }

        /// JPEG overview → best (plate_text, confidence) or None.
        pub fn detect_and_read(&self, jpeg: &[u8]) -> Result<Option<(String, f32)>> {
            let img = image::load_from_memory(jpeg)?.to_rgb8();
            // detector input: 640x640 float32 NCHW /255
            let resized = image::imageops::resize(&img, 640, 640, FilterType::Triangle);
            let mut input = ndarray::Array4::<f32>::zeros((1, 3, 640, 640));
            for (x, y, px) in resized.enumerate_pixels() {
                for c in 0..3 {
                    input[[0, c, y as usize, x as usize]] = px[c] as f32 / 255.0;
                }
            }
            let outputs = self.detector.run(ort::inputs![input]?)?;
            let det = outputs[0].try_extract_tensor::<f32>()?;
            let (rows, cols) = (det.shape()[1], det.shape()[2]);
            let mut best: Option<(f32, [f32; 4])> = None;
            for r in 0..rows {
                let conf = det[[0, r, 4]];
                if conf < 0.5 {
                    continue;
                }
                let bx = [
                    det[[0, r, 0]],
                    det[[0, r, 1]],
                    det[[0, r, 2]],
                    det[[0, r, 3]],
                ];
                if best.map(|(c, _)| conf > c).unwrap_or(true) {
                    best = Some((conf, bx));
                }
            }
            let Some((det_conf, bx)) = best else {
                return Ok(None);
            };
            let _ = det_conf;

            // crop plate region from the original image (boxes are in 640-space)
            let (w, h) = (img.width() as f32, img.height() as f32);
            let (sx, sy) = (w / 640.0, h / 640.0);
            let (x1, y1) = ((bx[0] * sx) as u32, (bx[1] * sy) as u32);
            let (x2, y2) = ((bx[2] * sx) as u32, (bx[3] * sy) as u32);
            let crop = DynamicImage::ImageRgb8(img)
                .crop_imm(x1, y1, x2.saturating_sub(x1), y2.saturating_sub(y1))
                .to_luma8();
            let crop = image::imageops::resize(&crop, 128, 32, FilterType::Triangle);
            let mut rinput = ndarray::Array4::<f32>::zeros((1, 1, 32, 128));
            for (x, y, px) in crop.enumerate_pixels() {
                rinput[[0, 0, y as usize, x as usize]] = px[0] as f32 / 255.0;
            }
            let rout = self.recognizer.run(ort::inputs![rinput]?)?;
            let logits = rout[0].try_extract_tensor::<f32>()?;
            let (_b, t_steps, n_classes) =
                (logits.shape()[0], logits.shape()[1], logits.shape()[2]);
            let _ = (cols, n_classes);

            // CTC greedy decode: argmax per timestep, collapse repeats, drop blank(0)
            let mut text = String::new();
            let mut conf_acc = 0f32;
            let mut n = 0usize;
            let mut prev = usize::MAX;
            for t in 0..t_steps {
                let mut argmax = 0usize;
                let mut maxv = f32::MIN;
                for c in 0..n_classes {
                    let v = logits[[0, t, c]];
                    if v > maxv {
                        maxv = v;
                        argmax = c;
                    }
                }
                if argmax != 0 && argmax != prev {
                    if let Some(ch) = ALPHABET.get(argmax.saturating_sub(1)) {
                        text.push(*ch as char);
                        conf_acc += maxv.exp();
                        n += 1;
                    }
                }
                prev = argmax;
            }
            if text.is_empty() {
                return Ok(None);
            }
            let conf = (conf_acc / n.max(1) as f32).min(1.0);
            Ok(Some((text, conf)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn dedup_suppresses_same_plate_within_window() {
        let mut d = Dedup::new(Duration::from_secs(3));
        let t0 = Instant::now();
        assert!(d.admit("30E89241", t0));
        assert!(!d.admit("30E89241", t0 + Duration::from_secs(1)));
        assert!(!d.admit("30E89241", t0 + Duration::from_millis(2999)));
        assert!(d.admit("30E89241", t0 + Duration::from_secs(3)));
    }

    #[test]
    fn dedup_allows_different_plate_inside_window() {
        let mut d = Dedup::new(Duration::from_secs(3));
        let t0 = Instant::now();
        assert!(d.admit("AAA111", t0));
        assert!(d.admit("BBB222", t0 + Duration::from_secs(1)));
    }
}
