from app.services.event_gate import blocked_event


def test_maternity_hidden_unless_user_is_pregnant():
    assert blocked_event("Janani Suraksha Yojana (JSY)", {}, "I am a housewife in Maharashtra")
    assert not blocked_event("Janani Suraksha Yojana (JSY)", {}, "I am a pregnant woman")


def test_ladki_bahin_is_not_an_event_scheme():
    assert not blocked_event("Mukhyamantri - Majhi Ladki Bahin Yojana", {"other_conditions": []}, "housewife")


def test_marriage_assistance_needs_marriage_in_query():
    assert blocked_event("Marriage Assistance For Daughters", {}, "I am a widow")
    assert not blocked_event("Marriage Assistance For Daughters", {}, "I need help with my daughter's marriage")