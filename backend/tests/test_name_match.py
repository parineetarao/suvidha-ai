from types import SimpleNamespace as NS

from app.services.name_match import find_name_matches


def S(code, name):
    return NS(scheme_code=code, name=name, translations={})


ROWS = [
    S("mmlby", "Mukhyamantri - Majhi Ladki Bahin Yojana"),
    S("cmlby", "Chief Minister Ladli Behna Yojana"),
    S("pmkisan", "PM Kisan Samman Nidhi"),
    S("kpyg", "Kisan Parivahan Yojana"),
    S("msdsrp", "Mukhyamantri Sports Development Scheme - Retired Person"),
    S("fm", "Scheme to Provide Financial Assistance to Farmers"),
]


def test_finds_ladki_bahin_by_name():
    assert find_name_matches(ROWS, "ladki bahin yojana") == ["mmlby"]


def test_tolerates_spelling_variants():
    assert find_name_matches(ROWS, "tell me about ladaki bahin yojna") == ["mmlby"]


def test_pm_kisan_does_not_match_other_kisan_schemes():
    assert find_name_matches(ROWS, "pm kisan") == ["pmkisan"]


def test_profile_sentences_are_not_name_lookups():
    assert find_name_matches(ROWS, "I am a farmer from Gujarat, my annual income is 1 lakh rupees") == []
    assert find_name_matches(ROWS, "farmer") == []


def test_self_description_is_not_a_scheme_name():
    assert find_name_matches(ROWS, "I am a retired person") == []
    assert find_name_matches(ROWS, "retired person") == []
    assert find_name_matches(ROWS, "senior citizen") == []