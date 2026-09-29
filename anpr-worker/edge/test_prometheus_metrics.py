from urllib.request import urlopen

from edge.prometheus_metrics import EdgeMetrics, MetricsServer


def test_metrics_render_both_ocr_outcomes():
    metrics = EdgeMetrics("camera-1")
    metrics.ocr_attempt("complete")
    metrics.ocr_attempt("failed")
    metrics.ocr_attempt("failed")
    text = metrics.render().decode()
    assert 'outcome="complete"} 1' in text
    assert 'outcome="failed"} 2' in text


def test_metrics_server_exposes_prometheus_text():
    metrics = EdgeMetrics("camera-1")
    server = MetricsServer(metrics, 0)
    try:
        port = server._server.server_address[1]
        with urlopen(f"http://127.0.0.1:{port}/metrics", timeout=2) as response:
            assert response.status == 200
            assert b"edge_ocr_attempts_total" in response.read()
    finally:
        server.close()
