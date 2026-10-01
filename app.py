import csv
import glob
import os
import re
from datetime import datetime, timedelta
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CUSTOMER_RULES = {
    'CHEVRON PRODUCTS COMPANY': {'minYTD': 3, 'allowNewSetup': False},
    'CHEVRON': {'minYTD': 3, 'allowNewSetup': False},
    'J.M. SMUCKER': {'minYTD': 3, 'allowNewSetup': False},
    'JM SMUCKER': {'minYTD': 3, 'allowNewSetup': False},
    'OWENS CORNING': {'minYTD': 3, 'noFreightGuard': True, 'allowNewSetup': False},
    'JIM BEAM BRANDS CO.': {'allowNewSetup': False, 'noFreightGuard': True},
    'JIM BEAM BRANDS CO': {'allowNewSetup': False, 'noFreightGuard': True},
    'JIM BEAM': {'allowNewSetup': False, 'noFreightGuard': True},
    'PROXIMO SPIRITS INC': {'minYTD': 3, 'noFreightGuard': True, 'allowNewSetup': False},
    'PROXIMO': {'minYTD': 3, 'noFreightGuard': True, 'allowNewSetup': False},
    'BP LUBRICANTS': {'minYTD': 3, 'allowNewSetup': False},
    'BP LUBRICANTS - DEPT C': {'minYTD': 3, 'allowNewSetup': False},
    'VALVOLINE NORTH AMERICA': {'allowNewSetup': False},
    'VALVOLINE': {'allowNewSetup': False}
}

US_STATES = {
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY',
    'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND',
    'OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
}

def normalize_text(text: str) -> str:
    if not text:
        return ""
    t = text.upper().strip()
    replacements = {
        r'\bST\b|\bST\.\b': 'SAINT',
        r'\bW\b|\bW\.\b': 'WEST',
        r'\bE\b|\bE\.\b': 'EAST',
        r'\bN\b|\bN\.\b': 'NORTH',
        r'\bS\b|\bS\.\b': 'SOUTH',
        r'\bFT\b|\bFT\.\b': 'FORT',
        r'\bMT\b|\bMT\.\b': 'MOUNT',
        r'\bDOMINGZ\b|\bDOMINGEZ\b|\bDOMINGUEZ\b': 'DOMINGUEZ',
    }
    for pattern, replacement in replacements.items():
        t = re.sub(pattern, replacement, t)
    return t


def expand_city_word(token: str):
    value = str(token or '').upper().strip()
    if not value:
        return []

    aliases = {
        'FT': ['FT', 'FORT'],
        'FORT': ['FT', 'FORT'],
        'MT': ['MT', 'MOUNT'],
        'MOUNT': ['MT', 'MOUNT'],
        'ST': ['ST', 'SAINT'],
        'SAINT': ['ST', 'SAINT'],
        'W': ['W', 'WEST'],
        'WEST': ['W', 'WEST'],
        'E': ['E', 'EAST'],
        'EAST': ['E', 'EAST'],
        'N': ['N', 'NORTH'],
        'NORTH': ['N', 'NORTH'],
        'S': ['S', 'SOUTH'],
        'SOUTH': ['S', 'SOUTH'],
    }
    return aliases.get(value, [value])


def build_city_variants(city_value):
    city = str(city_value or '').upper().strip()
    if not city:
        return set()

    cleaned = re.sub(r'[^A-Z0-9]+', ' ', city)
    parts = [part for part in cleaned.split() if part]
    if not parts:
        return {city}

    variants = set()
    expanded_parts = []
    for part in parts:
        expanded_parts.extend(expand_city_word(part))

    if expanded_parts:
        variants.add(' '.join(expanded_parts))
        variants.add(''.join(expanded_parts))

    for idx in range(len(expanded_parts) - 1):
        variants.add(f"{expanded_parts[idx]} {expanded_parts[idx + 1]}")
        variants.add(f"{expanded_parts[idx]}{expanded_parts[idx + 1]}")

    for part in parts:
        variants.add(part)
        if part in {'FT', 'MT', 'ST', 'W', 'E', 'N', 'S'}:
            variants.update(expand_city_word(part))

    return variants

def parse_requested_date(text: str):
    date_match = re.search(r'\b(0?[1-9]|1[0-2])[\/\.-](0?[1-9]|[12]\d|3[01])(?:[\/\.-](\d{2,4}))?\b', text)
    if date_match:
        month = int(date_match.group(1))
        day = int(date_match.group(2))
        year = date_match.group(3)
        if not year:
            year = "2026"
        elif len(year) == 2:
            year = f"20{year}"
        return f"{month:02d}/{day:02d}/{year}"
    return None

def parse_state_query(text: str):
    pattern = r'\b([A-Z]{2})\s*(?:TO|->|-|\/)\s*([A-Z]{2})\b'
    matches = re.findall(pattern, text)
    for orig, dest in matches:
        if orig in US_STATES and dest in US_STATES:
            return orig, dest
    return None, None

def get_latest_aljex_csv():
    load_data = []
    search_paths = [
        "loads.csv",
        "*.csv",
        os.path.expanduser("~/Downloads/*.csv"),
        "C:/Users/gersi/Downloads/*.csv"
    ]
    all_files = []
    for pattern in search_paths:
        all_files.extend(glob.glob(pattern))

    if not all_files:
        return []

    target_file = max(all_files, key=os.path.getmtime)

    try:
        with open(target_file, mode='r', encoding='utf-8', errors='ignore') as f:
            reader = csv.DictReader(f)
            for row in reader:
                status = str(row.get('Status', '')).strip().upper()
                if status in ['OPEN', '']:
                    load_data.append(row)
    except Exception as e:
        print(f"Error reading {target_file}: {e}")
        
    return load_data

class EmailPayload(BaseModel):
    subject: str
    body: str
    aljex_status: str = "Y"
    ytd_loads: int = 0
    live_loads: list[dict] | None = None

def parse_mc_dot(text: str):
    if not text:
        return None, None

    def clean_digits(match_obj):
        digits = re.sub(r'\D', '', match_obj.group(0))
        return digits if 5 <= len(digits) <= 8 else None

    mc_match = None
    for pattern in [
        r'(?:MC|MC#|MC\s*#?|MC\s*IS)[^\nA-Z0-9]{0,8}\d[\d\s\-]*\d',
        r'\bMC\b[^\n0-9]{0,8}\d[\d\s\-]*\d',
        r'\b\d{5,7}\b'
    ]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            cleaned = clean_digits(match)
            if cleaned and len(cleaned) in (5, 6, 7):
                mc_match = cleaned
                break

    dot_match = None
    for pattern in [
        r'(?:DOT|USDOT|DOT\s*#|DOT\s*IS)[^\nA-Z0-9]{0,8}\d[\d\s\-]*\d',
        r'\bDOT\b[^\n0-9]{0,8}\d[\d\s\-]*\d'
    ]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            cleaned = clean_digits(match)
            if cleaned and len(cleaned) in (5, 6, 7, 8):
                dot_match = cleaned
                break

    if not mc_match:
        fallback_candidates = re.findall(r'\d{5,7}', text)
        if fallback_candidates:
            mc_match = fallback_candidates[0]

    return mc_match, dot_match

def get_customer_rule(customer_name):
    cust_upper = str(customer_name or '').upper()
    for key in CUSTOMER_RULES:
        if key in cust_upper:
            return CUSTOMER_RULES[key]
    return None


def format_single_load(row):
    def get_value(keys, default=''):
        for key in keys:
            if key in row and row.get(key) not in (None, ''):
                return row.get(key)
        return default

    carrier_rate_raw = get_value(['Carrier Rate', 'CarrierRate', 'Rate'])
    max_rate_raw = get_value(['Max Truck Rate', 'Max TruckRate', 'Max Rate', 'MaxRate'])

    try:
        carrier_rate = float(str(carrier_rate_raw).replace('$', '').replace(',', ''))
    except:
        carrier_rate = 0.0

    try:
        max_rate = float(str(max_rate_raw).replace('$', '').replace(',', ''))
    except:
        max_rate = carrier_rate

    if max_rate <= carrier_rate or max_rate == 0:
        mid_rate = carrier_rate
    else:
        mid_rate = round(carrier_rate + ((max_rate - carrier_rate) / 2))

    return {
        "pro": str(get_value(['Pro', 'PRO'], '')).strip(),
        "customer": str(get_value(['Customer Name', 'Customer', 'Company Name'], '')).strip(),
        "pu": f"{get_value(['PU City', 'Origin City'])}, {get_value(['PU St', 'Origin St'])} – {get_value(['PU Appt Dt', 'PU Date', 'Pickup Date'])} {get_value(['PU Appt Tm', 'Pickup Time'], '')}".strip(),
        "del": f"{get_value(['Cons City', 'Destination City'])}, {get_value(['Cons St', 'Destination St'])} – {get_value(['Del Appt Dt', 'Delivery Date'])} {get_value(['Del Appt Tm', 'Delivery Time'], '')}".strip(),
        "pu_date": str(get_value(['PU Appt Dt', 'PU Date', 'Pickup Date'], '')).strip(),
        "miles": get_value(['Cust Miles', 'Miles']),
        "weight": get_value(['Weight', 'Load Weight']),
        "freight": get_value(['Description', 'Commodity']),
        "equipment": get_value(['Eqpt Type', 'Equipment']),
        "carrier_rate": f"${carrier_rate:,.2f}",
        "mid_rate": f"${mid_rate:,.2f}",
        "max_rate": f"${max_rate:,.2f}"
    }


def normalize_date_value(value):
    if not value:
        return ""
    value = str(value).strip()
    if ' ' in value:
        value = value.split(' ')[0]
    return value


def normalize_lane_token(value):
    if value is None:
        return ""
    return re.sub(r'[^A-Z0-9]', '', str(value).upper())


def levenshtein_distance(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)

    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            insert_cost = current[j - 1] + 1
            delete_cost = previous[j] + 1
            replace_cost = previous[j - 1] + (ca != cb)
            current.append(min(insert_cost, delete_cost, replace_cost))
        previous = current
    return previous[-1]


def token_similarity_score(a: str, b: str) -> float:
    a = (a or '').upper().strip()
    b = (b or '').upper().strip()
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1.0
    dist = levenshtein_distance(a, b)
    return 1.0 - (dist / max_len)


def city_name_matches(city_value, email_text):
    city = str(city_value or '').strip()
    if not city:
        return False

    city_variants = build_city_variants(city)
    if not city_variants:
        return False

    email_clean = re.sub(r'[^A-Z0-9]+', ' ', str(email_text or '').upper())
    email_tokens = [token for token in email_clean.split() if token]
    if not email_tokens:
        return False

    email_variants = set()
    for token in email_tokens:
        expanded = expand_city_word(token)
        email_variants.update(expanded)
        email_variants.add(token)

    for idx in range(len(email_tokens) - 1):
        pair = f"{email_tokens[idx]} {email_tokens[idx + 1]}"
        compact_pair = f"{email_tokens[idx]}{email_tokens[idx + 1]}"
        email_variants.add(pair)
        email_variants.add(compact_pair)

    for variant in city_variants:
        if variant in email_variants:
            return True
        if any(variant in other or other in variant for other in email_variants):
            return True

    try:
        from difflib import SequenceMatcher
        for variant in city_variants:
            for other in email_variants:
                ratio = SequenceMatcher(None, variant, other).ratio()
                if ratio >= 0.75:
                    return True
                score = token_similarity_score(variant, other)
                if score >= 0.72:
                    return True
    except Exception:
        pass

    return False


def lane_row_matches_email(row, email_text):
    if not row or not email_text:
        return False

    text = str(email_text).upper()
    row_pu_city = str(row.get('PU City') or '').strip()
    row_del_city = str(row.get('Cons City') or '').strip()
    row_pu_state = str(row.get('PU St') or '').strip().upper()
    row_del_state = str(row.get('Cons St') or '').strip().upper()

    states = parse_state_query(text)
    if states:
        if row_pu_state and row_del_state:
            if row_pu_state == states[0] and row_del_state == states[1]:
                return True
            if row_pu_state in states or row_del_state in states:
                return True
        elif row_pu_state and row_del_state == '':
            if row_pu_state in text:
                return True

    if row_pu_state and row_del_state and row_pu_state in text and row_del_state in text:
        return True

    if row_pu_city and row_del_city:
        if city_name_matches(row_pu_city, text) and city_name_matches(row_del_city, text):
            return True

    if row_pu_state and row_pu_state in text and row_del_city and city_name_matches(row_del_city, text):
        return True

    if row_del_state and row_del_state in text and row_pu_city and city_name_matches(row_pu_city, text):
        return True

    if row_pu_state and row_del_state and row_pu_state == row_del_state:
        if row_pu_state in text or row_del_state in text:
            return True

    return False


def build_smart_reply(load, inquiry_text="", mc_number=None):
    inquiry_lower = (inquiry_text or '').lower()
    mc_value = str(mc_number or 'carrier').strip()
    commodity = str(load.get('freight') or load.get('commodity') or 'Commodity not listed').strip()
    current_rate = str(load.get('carrier_rate') or '$0.00').strip()
    mid_rate = str(load.get('mid_rate') or current_rate).strip()
    max_rate = str(load.get('max_rate') or current_rate).strip()
    equipment = str(load.get('equipment') or 'V').strip() or 'V'

    if 'commodity' in inquiry_lower or 'rate' in inquiry_lower:
        ask_line = "I’ve pulled the current load details directly from Aljex and the commodity/rate information below is the live rate sheet data for this opportunity."
    else:
        ask_line = "I’ve pulled the current load details directly from Aljex for this qualified opportunity."

    counter_target = mid_rate if mid_rate and mid_rate != '$0.00' else current_rate
    final_target = max_rate if max_rate and max_rate != '$0.00' else current_rate

    load_detail_block = (
        f"Pick: {load.get('pu', '')}\n"
        f"Del: {load.get('del', '')}\n"
        f"Miles: {load.get('miles', '')}\n"
        f"Weight: {load.get('weight', '')} lbs\n"
        f"Freight: {commodity}\n"
        f"Equipment: {equipment}\n"
        f"Rate: {current_rate}"
    )

    return (
        f"Hi,\n\n"
        f"Thank you for the inquiry about MC {mc_value}. This load is still available and qualifies for your MC based on the current live Aljex details.\n\n"
        f"{ask_line}\n\n"
        f"{load_detail_block}\n\n"
        f"Current published rate: {current_rate}\n"
        f"Midpoint counter target: {counter_target}\n"
        f"Final max we can go to: {final_target}\n\n"
        f"If you are still interested, I can counter at {counter_target} to keep the load moving and I can go as high as {final_target} if needed based on capacity and timing. Please confirm if you can cover at or above the midpoint target and I’ll send the rate confirmation right away.\n\n"
        f"Thank you!"
    )


def parse_date_value(value):
    raw = normalize_date_value(value)
    if not raw:
        return None

    for fmt in ('%m/%d/%Y', '%m/%d/%y', '%m-%d-%Y', '%m-%d-%y'):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def get_active_load_date_window(now=None):
    now = now or datetime.now()
    today = now.date()
    friday = today.weekday() == 4

    if friday:
        # Friday rule: before noon includes Saturday only; after noon includes Sunday + Monday.
        if now.hour < 12:
            return [today + timedelta(days=1)]
        return [today + timedelta(days=2), today + timedelta(days=3)]

    if now.hour < 12:
        return [today, today + timedelta(days=1)]
    return [today, today + timedelta(days=2)]


def row_matches_active_window(row, now=None):
    if not row:
        return True

    pu_date = parse_date_value(row.get('PU Appt Dt') or row.get('PU Date') or row.get('Pickup Date'))
    if pu_date is None:
        return True

    window = set(get_active_load_date_window(now))
    if now is None:
        now = datetime.now()

    today = now.date()
    if today.weekday() == 4:
        # Live Aljex load rows can still surface Saturday when the Friday afternoon window is active.
        window.add(today + timedelta(days=1))

    return pu_date in window

@app.post("/process-email")
def process_email(payload: EmailPayload):
    if payload.live_loads is not None:
        load_data = []
        for row in payload.live_loads:
            if row and isinstance(row, dict):
                row_dict = dict(row)
                if row_matches_active_window(row_dict):
                    load_data.append(row_dict)
    else:
        load_data = get_latest_aljex_csv()

    raw_full_text = f"{payload.subject}\n{payload.body}".upper()
    raw_mc, raw_dot = parse_mc_dot(raw_full_text)
    
    if not raw_mc and not raw_dot:
        return {
            "status": "MISSING_MC",
            "message": "No MC or DOT # found in email payload.",
            "auto_reply": "Hi,\n\nThank you for reaching out! Could you please reply with your MC or DOT # so I can check your setup in our system?\n\nThank you!"
        }

    clean_mc = re.sub(r'\D', '', str(raw_mc or raw_dot))
    aljex_status = payload.aljex_status.upper()
    ytd_loads = payload.ytd_loads

    if not load_data:
        if aljex_status == 'Y':
            return {
                "status": "QUALIFIED",
                "mc": clean_mc,
                "aljex_status": aljex_status,
                "ytd": ytd_loads,
                "message": "Carrier is active and set up with us. No customer restriction applies, so they are qualified to work this lane.",
                "auto_reply": "Hi,\n\nThank you for reaching out. I verified the MC is active in Aljex, with status Y and a valid YTD history. This customer is not under any restricted rule, so the carrier is qualified to work the lane.\n\nThank you!"
            }

        return {
            "status": "NO_LIVE_LOADS",
            "mc": clean_mc,
            "aljex_status": aljex_status,
            "ytd": ytd_loads,
            "message": "MC found, but the live Aljex open-load board is not loaded or has no active lanes available right now.",
            "auto_reply": "Hi,\n\nThank you for reaching out. I found your MC in Aljex, but the live open-load board is not currently active or has no matching lanes available. Please open the Open Loads board or send the lane details and I can check again.\n\nThank you!"
        }

    requested_date = parse_requested_date(raw_full_text)

    norm_text = normalize_text(raw_full_text)
    matching_loads = []

    # 1. City / lane matching with fuzzy tolerance
    if load_data:
        for row in load_data:
            if lane_row_matches_email(row, raw_full_text):
                matching_loads.append(format_single_load(row))

    # 2. State fallback matching
    state_only_matches = []
    if load_data:
        orig_st, dest_st = parse_state_query(raw_full_text)
        if orig_st and dest_st:
            for row in load_data:
                p_st = str(row.get('PU St', '')).strip().upper()
                c_st = str(row.get('Cons St', '')).strip().upper()
                if p_st == orig_st and c_st == dest_st:
                    matching_loads.append(format_single_load(row))
        elif orig_st or dest_st:
            for row in load_data:
                p_st = str(row.get('PU St', '')).strip().upper()
                c_st = str(row.get('Cons St', '')).strip().upper()
                if p_st and p_st in raw_full_text:
                    state_only_matches.append(format_single_load(row))
                elif c_st and c_st in raw_full_text:
                    state_only_matches.append(format_single_load(row))

    if not matching_loads and state_only_matches:
        if aljex_status == 'Y':
            return {
                "status": "QUALIFIED",
                "mc": clean_mc,
                "aljex_status": aljex_status,
                "ytd": ytd_loads,
                "message": "Carrier is active and set up with us, and this customer is not under a restricted rule. They are qualified to work the requested lane.",
                "auto_reply": "Hi,\n\nThank you for reaching out. I verified the carrier is active in Aljex with status Y and no restricted-customer rule applies to this lane, so they are qualified to work this opportunity.\n\nThank you!"
            }

        return {
            "status": "NEEDS_MORE_INFO",
            "mc": clean_mc,
            "aljex_status": aljex_status,
            "ytd": ytd_loads,
            "message": "I found loads in the same state lane, but the email does not specify the exact city. Please provide the specific pickup/delivery city names and I’ll narrow to the exact load options."
        }

    if not matching_loads:
        if aljex_status == 'Y':
            return {
                "status": "QUALIFIED",
                "mc": clean_mc,
                "aljex_status": aljex_status,
                "ytd": ytd_loads,
                "message": "Carrier is active and set up with us, and this customer is not under a restricted rule. They are qualified to work this lane.",
                "auto_reply": "Hi,\n\nThank you for reaching out. I verified the carrier is active in Aljex with status Y and no restricted-customer rule applies to this lane, so they are qualified to work this opportunity.\n\nThank you!"
            }

        return {
            "status": "MISSING_LANE",
            "mc": clean_mc,
            "aljex_status": aljex_status,
            "ytd": ytd_loads,
            "message": "MC found, but lane not found in active CSV or load is covered/closed.",
            "auto_reply": "Hi,\n\nThank you for reaching out! Which specific lane or origin/destination city/state are you inquiring about so I can send you the exact load details?\n\nThank you!"
        }

    # Date Filtering Logic
    date_filtered_loads = []
    active_window = get_active_load_date_window()

    if requested_date:
        active_window = [datetime.strptime(requested_date, '%m/%d/%Y').date()]

    for l in matching_loads:
        pu_date = normalize_date_value(l.get('pu_date'))
        if not pu_date:
            date_filtered_loads.append(l)
            continue
        if any(pu_date.startswith(day.strftime('%m/%d/%Y')) for day in active_window):
            date_filtered_loads.append(l)

    final_loads = date_filtered_loads if date_filtered_loads else matching_loads

    primary_load = final_loads[0]
    cust_upper = primary_load['customer'].upper()

    # Gate 1: Setup Status
    rule = get_customer_rule(primary_load['customer'])

    if aljex_status == 'N':
        return {
            "status": "UNQUALIFIED_SETUP",
            "mc": clean_mc,
            "aljex_status": aljex_status,
            "ytd": ytd_loads,
            "load": primary_load,
            "reason": "🔴 STATUS N: Existing record but NOT usable. Requires Carrier Services Reassessment.",
            "auto_reply": "Hi,\n\nAt this time, your company status requires a review/reassessment with our Carrier Services department before we can tender this load. Please check back with us once this review is complete.\n\nThank you."
        }

    if aljex_status == 'NO_RECORD':
        if rule and not rule.get('allowNewSetup', True):
            return {
                "status": "UNQUALIFIED_SETUP",
                "mc": clean_mc,
                "aljex_status": aljex_status,
                "ytd": ytd_loads,
                "load": primary_load,
                "reason": f"🔴 NO RECORD FOUND: Carrier is not set up with R2 Logistics and {primary_load['customer']} does not allow new setup.",
                "auto_reply": "Hi,\n\nUnfortunately, we do not have an active setup for your MC in our system for this opportunity and this customer does not allow new setup. Please check our other available opportunities.\n\nThank you."
            }

    # Gate 2: Customer Rules
    if rule and rule.get('minYTD') and ytd_loads < rule['minYTD']:
        return {
            "status": "UNQUALIFIED_RULE",
            "mc": clean_mc,
            "aljex_status": aljex_status,
            "ytd": ytd_loads,
            "load": primary_load,
            "reason": f"🔴 UNQUALIFIED: {primary_load['customer']} requires at least {rule['minYTD']} YTD loads (Carrier has {ytd_loads}).",
            "auto_reply": "Hi,\n\nUnfortunately, for this load, the customer requires carriers to have completed at least three loads with us year-to-date in order to be considered. Please check our other available opportunities.\n\nThank you,"
        }

    # Generate Responses
    options_responses = []
    all_options_text_list = []

    for idx, l in enumerate(final_loads, 1):
        load_details = (
            f"Option {idx} (Pro #{l['pro']}):\n"
            f"Pick: {l['pu']}\n"
            f"Del: {l['del']}\n"
            f"Miles: {l['miles']}\n"
            f"Weight: {l['weight']} lbs\n"
            f"Freight: {l['freight']}\n"
            f"Equipment: {l.get('equipment', 'V')}\n"
            f"Rate: {l['carrier_rate']}"
        )
        
        all_options_text_list.append(load_details)

        reply_initial = f"Hi,\n\nYes, this load is available! Here are the details:\n\n{load_details}\n\nPlease let me know if you are interested and can cover this.\n\nThank you!"
        reply_mid = f"Hi,\n\nI can work with you on Option {idx}! The best I can do right now is {l['mid_rate']} all-in. Let me know if that works for you and I'll send over the rate confirmation.\n\nThank you!"
        reply_max = f"Hi,\n\nAs much as I’d like to get Option {idx} covered with you, my absolute best and final rate is {l['max_rate']} all-in. Please let me know if that works for you.\n\nThank you!"
        smart_reply = build_smart_reply(l, raw_full_text, clean_mc)

        options_responses.append({
            "option_index": idx,
            "load": l,
            "load_details": load_details,
            "reply_initial": reply_initial,
            "reply_mid": reply_mid,
            "reply_max": reply_max,
            "smart_reply": smart_reply
        })

    combined_all_options_text = f"Hi,\n\nYes, we have multiple options available on this lane! Here are the details:\n\n" + "\n\n---\n\n".join(all_options_text_list) + "\n\nPlease let me know which option/schedule works best for you!\n\nThank you!"

    return {
        "status": "MATCH_FOUND",
        "mc": clean_mc,
        "aljex_status": aljex_status,
        "ytd": ytd_loads,
        "total_options": len(final_loads),
        "combined_all_options": combined_all_options_text,
        "options": options_responses
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)