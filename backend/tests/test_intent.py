from app.services.intent import needs_details_pure


def test_name_sentence_needs_details_even_if_gender_was_guessed():
    assert needs_details_pure("my name is Rahul Sharma", {"gender": "male", "has_request": True}, True, False)


def test_greeting_and_empty_need_details():
    assert needs_details_pure("hello", {}, False, False)
    assert needs_details_pure("   ", {}, False, False)


def test_hindi_and_marathi_names_need_details():
    assert needs_details_pure("मेरा नाम राहुल है", {}, False, False)
    assert needs_details_pure("माझे नाव सुनील आहे", {}, False, False)


def test_name_with_a_real_request_proceeds():
    assert not needs_details_pure("my name is Sunita and I am a widow", {"has_request": True}, True, False)
    assert not needs_details_pure("my name is Rahul, I am 60 years old", {"has_request": True}, True, False)


def test_plain_situations_and_keywords_proceed():
    assert not needs_details_pure("I am a 40 year old teacher", {"has_request": True}, True, False)
    assert not needs_details_pure("pension", {}, False, False)
    assert not needs_details_pure("hindu widow from Pune", {"has_request": True}, True, False)


def test_name_that_contains_a_word_is_still_a_name():
    assert needs_details_pure("my name is Harold", {}, False, False)


def test_gibberish_needs_details_but_scheme_names_never_do():
    assert needs_details_pure("asdf qwer", {"has_request": False}, False, False)
    assert not needs_details_pure("hello ladki bahin yojana", {}, False, True)