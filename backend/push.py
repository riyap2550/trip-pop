from exponent_server_sdk import PushClient, PushMessage


def send_push(tokens: list, title: str, body: str, data: dict):
    if not tokens:
        return
    try:
        PushClient().publish_multiple([
            PushMessage(to=t, title=title, body=body, data=data)
            for t in tokens
        ])
    except Exception:
        pass  # never let push failure break the request


def notify_trip_collaborators(state, trip_id: str, author_user_id: str, title: str, body: str):
    from store import find_memberships
    members = find_memberships(state, trip_id)
    recipient_user_ids = [m["user_id"] for m in members if m["user_id"] != author_user_id]
    tokens = [
        pt["token"]
        for pt in state.get("push_tokens", [])
        if pt["user_id"] in recipient_user_ids
    ]
    send_push(tokens, title, body, {"url": f"/trips/{trip_id}"})
