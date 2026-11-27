"""The report's car colour, read by Jev from one overview photo (owner 2026-11-27)."""
import io

from autopilot_worker import jev_colour


def jpg():
    from PIL import Image

    b = io.BytesIO()
    Image.new("RGB", (3000, 2000), (190, 190, 190)).save(b, "JPEG")
    return b.getvalue()


class FakeJev:
    def __init__(self, answer):
        self.answer, self.calls = answer, []

    def ask(self, state, questions, **kw):
        self.calls.append((state, questions, kw))
        return {"answers": {"colour": self.answer}}


DESK = [{"id": 1, "final_name": "Rear Bumper", "blob_path": "b/1.jpg"}, {"id": 2, "final_name": "Front View", "blob_path": "b/2.jpg"}]


def test_one_overview_photo_is_sent_small_and_a_sure_answer_is_kept():
    jev_colour._cache.clear()
    j, asked = FakeJev({"choice": "Silver", "confidence": 0.93}), []
    out = jev_colour.read(j, {"id": "c1", "desk": DESK}, lambda p: asked.append(p) or jpg())
    assert out == {"colour": "Silver"} and asked == ["b/2.jpg"] and len(j.calls) == 1
    from PIL import Image
    import base64
    a = next(iter(j.calls[0][2]["assets"].values()))
    assert max(Image.open(io.BytesIO(base64.b64decode(a["data_base64"]))).size) <= jev_colour.MAX_SIDE
    assert jev_colour.read(j, {"id": "c1", "desk": DESK}, lambda p: jpg()) == {"colour": "Silver"} and len(j.calls) == 1  # no second paid call


def test_unsure_or_broken_answers_give_nothing():
    jev_colour._cache.clear()
    assert jev_colour.read(FakeJev({"choice": "Silver", "confidence": 0.4}), {"id": "c2", "desk": DESK}, lambda p: jpg()) == {}
    jev_colour._cache.clear()
    assert jev_colour.read(FakeJev({"choice": "Plaid", "confidence": 0.99}), {"id": "c3", "desk": DESK}, lambda p: jpg()) == {}
    assert jev_colour.read(None, {"id": "c4", "desk": DESK}, lambda p: jpg()) == {}

    class Boom(FakeJev):
        def ask(self, *a, **k):
            raise RuntimeError("down")
    assert jev_colour.read(Boom({}), {"id": "c5", "desk": DESK}, lambda p: jpg()) == {}


def test_overview_falls_back_to_the_first_photo():
    over, dash = jev_colour.pick_photos([{"final_name": "Bonnet", "blob_path": "a"}, {"final_name": "Dashboard", "blob_path": "b"}])
    assert over["blob_path"] == "a" and dash["blob_path"] == "b"
