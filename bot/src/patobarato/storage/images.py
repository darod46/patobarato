"""Product photo storage (Supabase Storage)."""

import asyncio
from typing import Protocol

from supabase import Client

PRODUCT_IMAGES_BUCKET = "product-images"


class ImageStore(Protocol):
    async def upload(self, country: str, asin: str, data: bytes) -> str:
        """Stores the photo and returns its public URL."""
        ...


class SupabaseImageStore(ImageStore):
    def __init__(self, client: Client, bucket: str = PRODUCT_IMAGES_BUCKET) -> None:
        self._client = client
        self._bucket = bucket

    async def upload(self, country: str, asin: str, data: bytes) -> str:
        path = f"{country}/{asin}.jpg"

        def run() -> str:
            self._client.storage.from_(self._bucket).upload(
                path=path,
                file=data,
                file_options={"content-type": "image/jpeg", "upsert": "true"},
            )
            return self._client.storage.from_(self._bucket).get_public_url(path)

        return await asyncio.to_thread(run)
