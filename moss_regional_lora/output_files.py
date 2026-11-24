"""Fork (ahx): the images in ComfyUI's output folder, subfolders included, for the editor's Background list.

ComfyUI's own /internal/files/output lists the top folder only, so images saved to a subfolder (a Save
Image prefix such as "moss-image/...") would be missing from the list.
"""

import asyncio
import os

ROUTE = "/moss_regional_ahx/output_images"   # _ahx: must not clash with the original node's routes
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif")
LIMIT = 500   # newest first; a longer list only slows the browser's suggestion box down


def output_images(root, limit=LIMIT):
    """Image files under `root` as "sub/name.png" paths, newest first; hidden files and folders skipped."""
    found = []
    folders = [root]
    while folders:
        folder = folders.pop()
        try:
            entries = list(os.scandir(folder))
        except OSError:
            continue
        for e in entries:
            if e.name.startswith("."):
                continue
            try:
                if e.is_dir(follow_symlinks=False):
                    folders.append(e.path)
                elif e.name.lower().endswith(IMAGE_EXTENSIONS) and e.is_file():
                    found.append((e.stat().st_mtime, os.path.relpath(e.path, root).replace(os.sep, "/")))
            except OSError:   # removed while listing
                continue
    found.sort(reverse=True)
    return [path for _, path in found[:limit]]


def register():
    """Adds the route to ComfyUI's server; does nothing outside ComfyUI (tests)."""
    try:
        import folder_paths
        from aiohttp import web
        from server import PromptServer
    except ImportError:
        return

    @PromptServer.instance.routes.get(ROUTE)
    async def _output_images(request):
        root = folder_paths.get_output_directory()
        return web.json_response(await asyncio.to_thread(output_images, root))
