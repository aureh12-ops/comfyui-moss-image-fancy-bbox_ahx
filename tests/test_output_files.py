"""Fork (ahx): the Background list's image list (output_files.py)."""

import os

from moss_regional_lora import output_files


def _touch(path, mtime):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"x")
    os.utime(path, (mtime, mtime))


def test_lists_images_in_subfolders_newest_first(tmp_path):
    _touch(tmp_path / "old.png", 100)
    _touch(tmp_path / "moss-image" / "new.png", 300)
    _touch(tmp_path / "a" / "b" / "mid.JPG", 200)
    _touch(tmp_path / "notes.txt", 400)
    _touch(tmp_path / ".hidden.png", 500)
    _touch(tmp_path / ".cache" / "inside.png", 600)
    assert output_files.output_images(str(tmp_path)) == ["moss-image/new.png", "a/b/mid.JPG", "old.png"]


def test_keeps_only_the_newest(tmp_path):
    for k in range(5):
        _touch(tmp_path / f"{k}.png", 100 + k)
    assert output_files.output_images(str(tmp_path), limit=2) == ["4.png", "3.png"]


def test_missing_folder_is_an_empty_list(tmp_path):
    assert output_files.output_images(str(tmp_path / "nope")) == []


def test_register_does_nothing_outside_comfyui():
    assert output_files.register() is None
