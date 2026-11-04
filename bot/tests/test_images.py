import os
import uuid

import httpx
import pytest

from patobarato.storage.images import SupabaseImageStore

FILE_OPTIONS = {"content-type": "image/jpeg", "upsert": "true"}


class FakeBucket:
    def __init__(self) -> None:
        self.uploads: list[dict] = []

    def upload(self, path, file, file_options):
        self.uploads.append({"path": path, "file": file, "file_options": file_options})

    def get_public_url(self, path):
        return f"https://x.supabase.co/storage/v1/object/public/product-images/{path}"


class FakeClient:
    def __init__(self) -> None:
        self.bucket = FakeBucket()
        self.buckets: list[str] = []

        outer = self

        class Storage:
            def from_(self, name):
                outer.buckets.append(name)
                return outer.bucket

        self.storage = Storage()


async def test_upload_returns_public_url():
    client = FakeClient()
    url = await SupabaseImageStore(client).upload("ES", "B000000001", b"x")
    assert client.buckets == ["product-images", "product-images"]
    assert client.bucket.uploads == [
        {"path": "ES/B000000001.jpg", "file": b"x", "file_options": FILE_OPTIONS}
    ]
    assert url.endswith("/product-images/ES/B000000001.jpg")


@pytest.mark.skipif(
    not (os.getenv("SUPABASE_TEST_URL") and os.getenv("SUPABASE_TEST_KEY")),
    reason="SUPABASE_TEST_URL / SUPABASE_TEST_KEY not set",
)
async def test_integration_upload_and_cleanup():
    from supabase import create_client

    client = create_client(
        os.environ["SUPABASE_TEST_URL"], os.environ["SUPABASE_TEST_KEY"]
    )
    asin = "T" + uuid.uuid4().hex[:9].upper()
    path = f"ES/{asin}.jpg"
    try:
        url = await SupabaseImageStore(client).upload("ES", asin, b"\xff\xd8test")
        assert url.endswith(f"/product-images/{path}")
        assert httpx.get(url).status_code == 200
    finally:
        client.storage.from_("product-images").remove([path])
