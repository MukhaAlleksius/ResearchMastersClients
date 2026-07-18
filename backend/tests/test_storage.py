import tempfile

from core.storage import LocalStorage, delete_avatar_files, find_avatar_key


def test_local_storage_save_read_delete():
    with tempfile.TemporaryDirectory() as tmp:
        storage = LocalStorage(tmp)
        storage.save("avatars/1_test.jpg", b"image-bytes")
        assert storage.read("avatars/1_test.jpg") == b"image-bytes"
        assert storage.exists("avatars/1_test.jpg")
        storage.delete("avatars/1_test.jpg")
        assert storage.read("avatars/1_test.jpg") is None


def test_find_avatar_key(monkeypatch, tmp_path):
    avatars = tmp_path / "avatars"
    avatars.mkdir()
    (avatars / "42_photo.jpg").write_bytes(b"x")

    import core.config as config

    monkeypatch.setattr(config, "UPLOAD_DIR", str(avatars))
    monkeypatch.setattr(config, "FILE_STORAGE_BACKEND", "local")

    assert find_avatar_key(42) == "42_photo.jpg"
    delete_avatar_files(42)
    assert find_avatar_key(42) is None
