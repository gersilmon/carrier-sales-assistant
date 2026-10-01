from datetime import datetime

from app import EmailPayload, build_smart_reply, city_name_matches, get_active_load_date_window, lane_row_matches_email, parse_mc_dot, process_email, row_matches_active_window


def test_morning_window_today_and_tomorrow():
    now = datetime(2026, 9, 29, 10, 30)
    assert [d.strftime('%Y-%m-%d') for d in get_active_load_date_window(now)] == [
        '2026-09-29',
        '2026-09-30',
    ]


def test_afternoon_window_today_and_day_after_tomorrow():
    now = datetime(2026, 9, 29, 13, 0)
    assert [d.strftime('%Y-%m-%d') for d in get_active_load_date_window(now)] == [
        '2026-09-29',
        '2026-10-01',
    ]


def test_friday_window_before_noon_only_saturday():
    now = datetime(2026, 10, 2, 11, 59)  # Friday before noon
    assert [d.strftime('%Y-%m-%d') for d in get_active_load_date_window(now)] == [
        '2026-10-03',
    ]


def test_friday_window_after_noon_sunday_monday():
    now = datetime(2026, 10, 2, 12, 00)  # Friday after noon
    assert [d.strftime('%Y-%m-%d') for d in get_active_load_date_window(now)] == [
        '2026-10-04',
        '2026-10-05',
    ]


def test_row_matches_active_window_for_live_open_loads():
    row = {'PU Appt Dt': '10/03/2026'}
    now = datetime(2026, 10, 2, 15, 0)
    assert row_matches_active_window(row, now) is True

    row2 = {'PU Appt Dt': '10/02/2026'}
    assert row2 is not None
    assert row_matches_active_window(row2, now) is False


def test_smart_reply_includes_commodity_and_counter_offer():
    load = {
        'pro': '1750664',
        'customer': 'NESTLE USA',
        'pu': 'Dallas, TX – 10/03/2026 08:00',
        'del': 'Memphis, TN – 10/04/2026 18:00',
        'freight': 'Paper Products',
        'carrier_rate': '$1,250.00',
        'mid_rate': '$1,375.00',
        'max_rate': '$1,450.00',
    }
    reply = build_smart_reply(load, 'what is the commodity and rate?', '123456')
    assert 'Paper Products' in reply
    assert '$1,250.00' in reply
    assert '$1,375.00' in reply
    assert '$1,450.00' in reply
    assert 'counter' in reply.lower()


def test_parse_mc_dot_strips_separators_and_spaces():
    mc, dot = parse_mc_dot('MC 12-34567')
    assert mc == '1234567'
    assert dot is None


def test_lane_row_matches_email_with_fuzzy_state_and_typo():
    row = {'PU City': 'Dalllas', 'PU St': 'TX', 'Cons City': 'Memphis', 'Cons St': 'TN'}
    assert lane_row_matches_email(row, 'Dallas TX to Memphis TN') is True
    assert lane_row_matches_email(row, 'TX to TX') is True


def test_city_name_matches_handles_abbreviations_and_typos():
    assert city_name_matches('Fort Smith', 'FT Smith, AR') is True
    assert city_name_matches('West Allis', 'W Allis, WI') is True
    assert city_name_matches('Mount Sterling', 'Mt Sterling, KY') is True
    assert city_name_matches('Saint Louis', 'St Louis, MO') is True
    assert city_name_matches('Fort Smith', 'Fort Smit, AR') is True
    assert city_name_matches('West Allis', 'Wst Allis, WI') is True
    assert city_name_matches('Montgomery', 'Mongomery, AL') is True


def test_restricted_customer_rejects_new_setup_and_allowed_customer_allows_it():
    today = datetime.now().strftime('%m/%d/%Y')

    restricted = process_email(EmailPayload(
        subject='Load Inquiry',
        body='MC 9876543 looking for TX to AR',
        aljex_status='NO_RECORD',
        ytd_loads=0,
        live_loads=[{
            'PU City': 'Dallas', 'PU St': 'TX',
            'Cons City': 'Fort Smith', 'Cons St': 'AR',
            'PU Appt Dt': today,
            'Customer Name': 'Chevron Products Company',
            'Pro': '123',
            'Description': 'Plastic',
            'Carrier Rate': '$1200',
            'Max Truck Rate': '$1500',
            'Cust Miles': '500',
            'Weight': '20000'
        }]
    ))
    assert restricted['status'] == 'UNQUALIFIED_SETUP'

    allowed = process_email(EmailPayload(
        subject='Load Inquiry',
        body='MC 9876543 looking for TX to AR',
        aljex_status='NO_RECORD',
        ytd_loads=0,
        live_loads=[{
            'PU City': 'Dallas', 'PU St': 'TX',
            'Cons City': 'El Paso', 'Cons St': 'TX',
            'PU Appt Dt': today,
            'Customer Name': 'Customer X',
            'Pro': '456',
            'Description': 'Plastic',
            'Carrier Rate': '$1200',
            'Max Truck Rate': '$1500',
            'Cust Miles': '500',
            'Weight': '20000'
        }]
    ))
    assert allowed['status'] == 'MATCH_FOUND'
