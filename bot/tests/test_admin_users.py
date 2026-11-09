from types import SimpleNamespace

import pytest
from supabase_auth.errors import AuthApiError

from patobarato.admin.users import UserAdmin, UserError
from patobarato.storage.repository import InMemoryRepository


class FakeAdmin:
    def __init__(self):
        self.invited = []
        self.deleted = []
        self.error = None

    def invite_user_by_email(self, email, options=None):
        if self.error:
            raise self.error
        self.invited.append((email, options))
        return SimpleNamespace(user=SimpleNamespace(id="u-new"))

    def delete_user(self, user_id):
        self.deleted.append(user_id)


def make(admin_url="https://admin.example"):
    admin = FakeAdmin()
    client = SimpleNamespace(auth=SimpleNamespace(admin=admin))
    repo = InMemoryRepository()
    return UserAdmin(client, repo, admin_url), repo, admin


async def test_invite_registers_user():
    users, repo, admin = make()
    result = await users.invite("a@b.es")
    assert result == {"user_id": "u-new"}
    assert admin.invited == [("a@b.es", {"redirect_to": "https://admin.example/auth/confirm"})]
    assert repo.admin_users["u-new"]["email"] == "a@b.es"


async def test_invite_without_admin_url():
    users, _, _ = make(admin_url=None)
    with pytest.raises(UserError, match="Falta ADMIN_URL"):
        await users.invite("a@b.es")


async def test_invite_maps_auth_error():
    users, _, admin = make()
    admin.error = AuthApiError("Email ya registrado", 422, "email_exists")
    with pytest.raises(UserError, match="Email ya registrado"):
        await users.invite("a@b.es")


async def test_revoke_deletes_user():
    users, repo, admin = make()
    await repo.add_admin_user("o1", "o@b.es", is_owner=True)
    await repo.add_admin_user("u1", "u@b.es")
    assert await users.revoke("u1") == {"user_id": "u1"}
    assert admin.deleted == ["u1"]


async def test_revoke_last_owner_refused():
    users, repo, admin = make()
    await repo.add_admin_user("o1", "o@b.es", is_owner=True)
    with pytest.raises(UserError, match="último propietario"):
        await users.revoke("o1")
    assert admin.deleted == []


async def test_revoke_owner_allowed_when_another_exists():
    users, repo, admin = make()
    await repo.add_admin_user("o1", "o@b.es", is_owner=True)
    await repo.add_admin_user("o2", "p@b.es", is_owner=True)
    await users.revoke("o1")
    assert admin.deleted == ["o1"]
