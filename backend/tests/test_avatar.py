"""Profile pictures: upload, serve to signed-in users, replace, remove, and reject non-images."""

from conftest import add_member, register, seed_trip

JPEG = b"\xff\xd8\xff" + b"0" * 100
PNG = b"\x89PNG" + b"0" * 100


def upload(client, headers, data=JPEG, name="me.jpg"):
    return client.post("/me/avatar", files={"file": (name, data, "image/jpeg")}, headers=headers)


def test_upload_serve_replace_and_remove(client):
    a, a_id = register(client, "a@example.com", "Ana")
    b, _ = register(client, "b@example.com", "Ben")

    res = upload(client, a)
    assert res.status_code == 200
    url = res.json()["avatar_url"]
    assert url.startswith(f"/users/{a_id}/avatar?v=")

    # Any signed-in user can see it, but signed-out requests can't
    got = client.get(f"/users/{a_id}/avatar", headers=b)
    assert got.status_code == 200 and got.content == JPEG and got.headers["content-type"] == "image/jpeg"
    assert client.get(f"/users/{a_id}/avatar").status_code in (401, 403)

    # A new picture replaces the old one, even in another format
    assert upload(client, a, PNG).status_code == 200
    assert client.get(f"/users/{a_id}/avatar", headers=b).headers["content-type"] == "image/png"

    assert client.delete("/me/avatar", headers=a).json()["avatar_url"] is None
    assert client.get(f"/users/{a_id}/avatar", headers=b).status_code == 404


def test_rejects_non_images_and_oversize(client, monkeypatch):
    import social

    a, _ = register(client, "a@example.com")
    assert upload(client, a, b"not an image").status_code == 415
    monkeypatch.setattr(social, "MAX_AVATAR_BYTES", 50)
    assert upload(client, a).status_code == 413


def test_avatar_shows_on_trip_members_and_user_cards(client):
    a, a_id = register(client, "a@example.com", "Ana")
    b, b_id = register(client, "b@example.com", "Ben")
    trip_id = seed_trip(a_id)
    add_member(trip_id, b_id, "editor")
    url = upload(client, b).json()["avatar_url"]

    members = client.get(f"/social/profile/{b_id}", headers=a).json()
    assert members["user"]["avatar_url"] == url
    assert client.get("/social/users/search?q=b@example.com", headers=a).json()[0]["avatar_url"] == url
