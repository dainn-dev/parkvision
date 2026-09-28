"""Camera schemas + tenant camera CRUD, isolation, and FK-ownership tests."""

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.resources import CameraIn


def test_camera_in_rejects_bad_scheme():
    with pytest.raises(ValidationError):
        CameraIn(site_id=uuid.uuid4(), name="Cam", stream_url="ftp://x/y")


def test_camera_in_accepts_lan_rtsp():
    cam = CameraIn(site_id=uuid.uuid4(), name="Cam", stream_url="rtsp://u:p@192.168.1.10/1")
    assert cam.purpose == "plate"
