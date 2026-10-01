from app import EmailPayload, get_customer_rule, lane_row_matches_email, process_email


def test_abbrev_city_matches_with_state():
    row = {
        'PU City': 'ST LOUIS',
        'Cons City': 'CHICAGO',
        'PU St': 'MO',
        'Cons St': 'IL',
    }
    assert lane_row_matches_email(row, 'St Louis MO to Chi IL') is True


def test_state_only_email_still_matches_lane():
    row = {
        'PU City': 'DEKALB',
        'Cons City': 'SHEBOYGAN',
        'PU St': 'IL',
        'Cons St': 'WI',
    }
    assert lane_row_matches_email(row, 'Need a lane in IL only') is True


def test_dekalb_to_sheboygan_lane_matches_real_open_load():
    row = {
        'PU City': 'DEKALB',
        'Cons City': 'SHEBOYGAN',
        'PU St': 'IL',
        'Cons St': 'WI',
    }
    assert lane_row_matches_email(row, 'DEKALB, IL to SHEBOYGAN, WI') is True


def test_typo_in_city_still_matches_lane():
    row = {
        'PU City': 'GURNEE',
        'Cons City': 'DES MOINES',
        'PU St': 'IL',
        'Cons St': 'IA',
    }
    assert lane_row_matches_email(row, 'Gurne IL to Des Moines IA') is True


def test_active_setup_with_no_restricted_customer_is_qualified():
    payload = EmailPayload(
        subject='Load Request',
        body='MC 923983',
        aljex_status='Y',
        ytd_loads=12,
        live_loads=[]
    )
    result = process_email(payload)
    assert result['status'] == 'QUALIFIED'
    assert result['aljex_status'] == 'Y'
    assert result['ytd'] == 12


def test_no_live_loads_reports_clear_status():
    payload = EmailPayload(
        subject='Load Request',
        body='MC 923983',
        aljex_status='N',
        ytd_loads=0,
        live_loads=[]
    )
    result = process_email(payload)
    assert result['status'] == 'NO_LIVE_LOADS'


def test_exact_customer_rules_match_requirements():
    chevron = get_customer_rule('CHEVRON')
    assert chevron['minYTD'] == 3
    assert chevron.get('noFreightGuard') is not True

    jim_bean = get_customer_rule('JIM BEAM')
    assert jim_bean.get('minYTD') is None
    assert jim_bean.get('noFreightGuard') is True

    proximo = get_customer_rule('PROXIMO')
    assert proximo['minYTD'] == 3
    assert proximo.get('noFreightGuard') is True

    valvoline = get_customer_rule('VALVOLINE')
    assert valvoline.get('minYTD') is None
    assert valvoline.get('allowNewSetup') is False
